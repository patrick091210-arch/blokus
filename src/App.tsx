import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  PIECE_BY_ID,
  PUZZLE_BY_ID,
  computePlayablePieces,
  computeStandings,
  computeTeamStandings,
} from './engine/index.ts';
import type { PieceSize, Point } from './engine/index.ts';
import { requestAIMoveAsync } from './ai/workerClient.ts';
import {
  playInvalidSound,
  playPlaceSound,
  playRotateSound,
  playSelectSound,
  playVictorySound,
  setSoundMuted,
} from './audio/sound.ts';
import {
  canHumanActNow,
  createMenuState,
  isSeatHumanControlled,
  matchReducer,
} from './state/matchState.ts';
import { MODE_LABELS, getAlliedColorIds } from './state/matchTypes.ts';
import {
  appendScoreRecord,
  importMatchCode,
  loadActiveMatch,
  loadPreferences,
  loadScoreRecords,
  loadSolvedPuzzles,
  markPuzzleSolved,
  saveActiveMatch,
  savePreferences,
} from './state/storage.ts';
import type { UserPreferences } from './state/storage.ts';
import { StartScreen } from './components/StartScreen.tsx';
import { BoardStage } from './components/BoardStage.tsx';
import { PieceTray } from './components/PieceTray.tsx';
import { PlayerRail } from './components/PlayerRail.tsx';
import { MatchModalOverlays, ReplayControlBar } from './components/Overlays.tsx';

export function App() {
  const [prefs, setPrefs] = useState<UserPreferences>(() => {
    const loaded = loadPreferences();
    setSoundMuted(loaded.soundMuted);
    return loaded;
  });
  const [savedMatch, setSavedMatch] = useState(() => loadActiveMatch());
  const [records, setRecords] = useState(() => loadScoreRecords());
  const [solvedPuzzles, setSolvedPuzzles] = useState(() => loadSolvedPuzzles());
  const [dragBoardPoint, setDragBoardPoint] = useState<Point | null>(null);

  const [state, dispatch] = useReducer(
    matchReducer,
    undefined,
    () => createMenuState({
      mode: 'solo',
      difficulty: 'medium',
      opponentType: 'ai',
      clockPreset: 'off',
      scoringRule: loadPreferences().scoringRule,
    }),
  );

  const updatePrefs = useCallback((patch: Partial<UserPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      setSoundMuted(next.soundMuted);
      savePreferences(next);
      if (patch.scoringRule) {
        dispatch({ type: 'SET_SCORING_RULE', scoringRule: patch.scoringRule });
      }
      return next;
    });
  }, []);

  const canHumanAct = canHumanActNow(state);
  const currentSeat = state.players[state.turn];

  const playablePieces = useMemo(() => {
    if (!currentSeat || state.phase !== 'playing') return new Set<string>();
    return computePlayablePieces(state.board, state.turn, currentSeat.available);
  }, [currentSeat, state.board, state.phase, state.turn]);

  // Audio feedback hooks
  const prevMoveSerial = useRef(0);
  const prevErrorSerial = useRef(0);
  const recordedGameOverSession = useRef(0);

  useEffect(() => {
    if (state.lastMove && state.lastMove.serial !== prevMoveSerial.current) {
      prevMoveSerial.current = state.lastMove.serial;
      if (state.phase === 'playing' || state.phase === 'gameover') {
        const sz = PIECE_BY_ID[state.lastMove.pieceId]?.size ?? 4;
        playPlaceSound(sz);
      }
    }
  }, [state.lastMove, state.phase]);

  useEffect(() => {
    if (state.errorSerial !== prevErrorSerial.current) {
      prevErrorSerial.current = state.errorSerial;
      if (state.errorSerial > 0) playInvalidSound();
    }
  }, [state.errorSerial]);

  // Auto-save active match & record results on gameover
  useEffect(() => {
    if (state.phase === 'playing' && state.historyIndex > 0) {
      const payload = {
        version: 2 as const,
        config: state.config,
        history: state.history,
        historyIndex: state.historyIndex,
        clocksMs: state.clocksMs,
        savedAt: new Date().toISOString(),
      };
      saveActiveMatch(payload);
      setSavedMatch(payload);
    } else if (state.phase === 'gameover' && recordedGameOverSession.current !== state.sessionId) {
      recordedGameOverSession.current = state.sessionId;
      saveActiveMatch(null);
      setSavedMatch(null);

      if (state.config.mode === 'puzzle') {
        if (state.puzzleSolved && state.config.puzzleId) {
          playVictorySound();
          setSolvedPuzzles(markPuzzleSolved(state.config.puzzleId));
        }
        return;
      }

      playVictorySound();
      const rule = state.config.scoringRule;
      if (state.config.mode === 'tournament_1v1') {
        const teams = computeTeamStandings(state.players, rule);
        const top = teams[0];
        const tied = teams.filter((t) => t.isWinner).length > 1;
        setRecords(
          appendScoreRecord({
            mode: state.config.mode,
            score: top.displayScore,
            scoringRule: rule,
            winnerName: top.name,
            result: tied ? 'TIE' : top.isHuman ? 'WIN' : 'LOSS',
            difficulty: state.config.difficulty,
            date: new Date().toLocaleDateString(),
          }),
        );
      } else {
        const standings = computeStandings(state.players, rule);
        const top = standings[0];
        const tied = standings.filter((s) => s.isWinner).length > 1;
        setRecords(
          appendScoreRecord({
            mode: state.config.mode,
            score: top.displayScore,
            scoringRule: rule,
            winnerName: top.name,
            result: tied ? 'TIE' : top.isHuman ? 'WIN' : 'LOSS',
            difficulty: state.config.difficulty,
            date: new Date().toLocaleDateString(),
          }),
        );
      }
    }
  }, [
    state.clocksMs,
    state.config,
    state.history,
    state.historyIndex,
    state.phase,
    state.players,
    state.puzzleSolved,
    state.sessionId,
  ]);

  // Non-blocking Web Worker AI turn execution
  useEffect(() => {
    if (state.phase !== 'playing' || state.handoff) return;
    if (isSeatHumanControlled(state, state.turn)) return;

    const sessionId = state.sessionId;
    const colorId = state.turn;
    const allied = getAlliedColorIds(state.config.mode, colorId);
    const startTs = performance.now();

    const { promise, cancel } = requestAIMoveAsync({
      board: state.board,
      players: state.players,
      turnColorId: colorId,
      difficulty: state.config.difficulty,
      alliedColorIds: allied,
      maxTimeMs: 240,
    });

    let timerId: number | null = null;
    void promise.then((move) => {
      const elapsed = performance.now() - startTs;
      const pacingDelay = Math.max(0, 210 - elapsed);
      timerId = window.setTimeout(() => {
        dispatch({ type: 'AI_MOVE_RESOLVED', sessionId, colorId, move });
      }, pacingDelay);
    });

    return () => {
      cancel();
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [state.board, state.config.difficulty, state.config.mode, state.handoff, state.phase, state.players, state.sessionId, state.turn]);

  // Blitz Chess Clock ticker
  useEffect(() => {
    if (state.phase !== 'playing' || state.handoff || !state.clocksMs) return;
    let lastTick = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.round(now - lastTick);
      lastTick = now;
      if (dt > 0) dispatch({ type: 'TICK_CLOCK', elapsedMs: dt });
    }, 200);
    return () => window.clearInterval(id);
  }, [Boolean(state.clocksMs), state.handoff, state.phase, state.turn]);

  // Rich Keyboard Shortcuts
  useEffect(() => {
    if (state.phase === 'start') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();

      if (e.key === 'Escape') {
        e.preventDefault();
        if (state.phase === 'playing' && state.selectedPiece && !state.handoff) {
          dispatch({ type: 'DESELECT_PIECE' });
        } else if (state.phase === 'playing') {
          dispatch({ type: 'PAUSE' });
        } else if (state.phase === 'paused') {
          dispatch({ type: 'RESUME' });
        }
        return;
      }

      if (state.handoff && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        dispatch({ type: 'READY_HANDOFF' });
        return;
      }

      if ((e.metaKey || e.ctrlKey) && key === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' });
        return;
      }

      if (key === 'z') {
        dispatch({ type: 'UNDO' });
      } else if (key === 'y') {
        dispatch({ type: 'REDO' });
      } else if (key === 'r') {
        playRotateSound();
        dispatch({ type: 'ROTATE', delta: e.shiftKey ? -1 : 1 });
      } else if (key === 'f') {
        playRotateSound();
        dispatch({ type: 'FLIP' });
      } else if (key === 'h') {
        updatePrefs({ showCornerHints: !prefs.showCornerHints });
      } else if (key === 't') {
        updatePrefs({ showTerritoryOverlay: !prefs.showTerritoryOverlay });
      } else if (['1', '2', '3', '4', '5'].includes(key)) {
        dispatch({ type: 'SET_SIZE_FILTER', size: Number(key) as PieceSize });
      } else if (e.key === 'ArrowUp' || key === 'w') {
        e.preventDefault();
        dispatch({ type: 'MOVE_CURSOR', dx: 0, dy: -1 });
      } else if (e.key === 'ArrowDown' || key === 's') {
        e.preventDefault();
        dispatch({ type: 'MOVE_CURSOR', dx: 0, dy: 1 });
      } else if (e.key === 'ArrowLeft' || key === 'a') {
        e.preventDefault();
        dispatch({ type: 'MOVE_CURSOR', dx: -1, dy: 0 });
      } else if (e.key === 'ArrowRight' || key === 'd') {
        e.preventDefault();
        dispatch({ type: 'MOVE_CURSOR', dx: 1, dy: 0 });
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (canHumanAct) {
          e.preventDefault();
          dispatch({ type: 'CONFIRM_CURSOR_PLACE', snap: prefs.snapToCorner });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canHumanAct, prefs.showCornerHints, prefs.showTerritoryOverlay, prefs.snapToCorner, state.handoff, state.phase, state.selectedPiece, updatePrefs]);

  if (state.phase === 'start') {
    return (
      <StartScreen
        initialConfig={state.config}
        savedMatch={savedMatch}
        records={records}
        solvedPuzzles={solvedPuzzles}
        prefs={prefs}
        onUpdatePrefs={updatePrefs}
        onStartMatch={(cfg) => dispatch({ type: 'START_MATCH', config: cfg })}
        onResumeSaved={() => {
          if (savedMatch) dispatch({ type: 'LOAD_SAVED_MATCH', saved: savedMatch });
        }}
        onDiscardSaved={() => {
          saveActiveMatch(null);
          setSavedMatch(null);
        }}
        onImportCode={(code, openInReplay) => {
          const parsed = importMatchCode(code);
          if (!parsed) return false;
          dispatch({
            type: 'IMPORT_MATCH',
            config: parsed.config,
            history: parsed.history,
            openInReplay,
          });
          return true;
        }}
      />
    );
  }

  const activePuzzle =
    state.config.mode === 'puzzle' && state.config.puzzleId
      ? PUZZLE_BY_ID[state.config.puzzleId]
      : null;

  return (
    <div className="min-h-screen bg-[#0f171c] text-[#f1f1eb] flex flex-col">
      <header className="border-b border-white/10 bg-[#121c22]/90 px-4 py-2.5">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => dispatch({ type: 'EXIT_TO_MENU' })}
              className="rounded-lg bg-white/5 px-2.5 py-1 text-xs font-bold tracking-wider text-slate-200 ring-1 ring-white/10 hover:bg-white/10"
            >
              ← MENU
            </button>
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider text-white">
                {MODE_LABELS[state.config.mode]}
              </div>
              <div className="text-[11px] text-slate-400" aria-live="polite">
                {state.message}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => updatePrefs({ showCornerHints: !prefs.showCornerHints })}
              className={`rounded-lg px-2.5 py-1 font-semibold ring-1 transition ${
                prefs.showCornerHints
                  ? 'bg-sky-400/20 text-sky-200 ring-sky-400/40'
                  : 'bg-white/5 text-slate-300 ring-white/10'
              }`}
              title="Highlight valid expansion corners (Shortcut H)"
            >
              Corners [H]
            </button>
            <button
              type="button"
              onClick={() => updatePrefs({ showTerritoryOverlay: !prefs.showTerritoryOverlay })}
              className={`rounded-lg px-2.5 py-1 font-semibold ring-1 transition ${
                prefs.showTerritoryOverlay
                  ? 'bg-emerald-400/20 text-emerald-200 ring-emerald-400/40'
                  : 'bg-white/5 text-slate-300 ring-white/10'
              }`}
              title="Show Voronoi territory influence map (Shortcut T)"
            >
              Territory [T]
            </button>
            <button
              type="button"
              onClick={() => updatePrefs({ snapToCorner: !prefs.snapToCorner })}
              className={`rounded-lg px-2.5 py-1 font-semibold ring-1 transition ${
                prefs.snapToCorner
                  ? 'bg-amber-400/20 text-amber-200 ring-amber-400/40'
                  : 'bg-white/5 text-slate-300 ring-white/10'
              }`}
            >
              Snap: {prefs.snapToCorner ? 'On' : 'Off'}
            </button>
            <button
              type="button"
              onClick={() => updatePrefs({ colorblindMode: !prefs.colorblindMode })}
              className={`rounded-lg px-2.5 py-1 font-semibold ring-1 transition ${
                prefs.colorblindMode
                  ? 'bg-purple-400/20 text-purple-200 ring-purple-400/40'
                  : 'bg-white/5 text-slate-300 ring-white/10'
              }`}
            >
              CB Pattern
            </button>
            <button
              type="button"
              onClick={() => updatePrefs({ soundMuted: !prefs.soundMuted })}
              className="rounded-lg bg-white/5 px-2.5 py-1 font-semibold text-slate-300 ring-1 ring-white/10 hover:bg-white/10"
            >
              {prefs.soundMuted ? '🔇' : '🔊'}
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'PAUSE' })}
              className="rounded-lg bg-white/10 px-2.5 py-1 font-bold text-white hover:bg-white/15"
            >
              Pause
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-4 p-4 lg:grid-cols-[250px_minmax(0,1fr)_320px] lg:items-start">
        <PlayerRail
          mode={state.config.mode}
          players={state.players}
          turn={state.turn}
          scoringRule={state.config.scoringRule}
          clocksMs={state.clocksMs}
          colorblindMode={prefs.colorblindMode}
          onToggleAutoplay={(cid) => dispatch({ type: 'TOGGLE_AI_AUTOPLAY', colorId: cid })}
          onToggleScoringRule={() =>
            updatePrefs({
              scoringRule: prefs.scoringRule === 'official' ? 'positive' : 'official',
            })
          }
        />

        <div className="flex flex-col">
          {activePuzzle && (
            <div className="mb-2.5 rounded-xl bg-sky-500/10 px-3.5 py-2 text-xs text-sky-200 ring-1 ring-sky-400/25">
              <span className="font-bold">Hint:</span> {activePuzzle.hint}
            </div>
          )}

          <BoardStage
            board={state.board}
            players={state.players}
            turn={state.turn}
            canHumanAct={canHumanAct}
            selectedPiece={state.selectedPiece}
            rotation={state.rotation}
            flipped={state.flipped}
            cursor={state.cursor}
            externalDragPoint={dragBoardPoint}
            lastMove={state.lastMove}
            colorblindMode={prefs.colorblindMode}
            showCornerHints={prefs.showCornerHints}
            showTerritoryOverlay={prefs.showTerritoryOverlay}
            snapToCorner={prefs.snapToCorner}
            onPlaceAtPointer={(pointer, isTouch) =>
              dispatch({ type: 'PLACE_AT_POINTER', pointer, snap: prefs.snapToCorner, isTouch })
            }
            onRotate={(delta) => {
              playRotateSound();
              dispatch({ type: 'ROTATE', delta });
            }}
            onFlip={() => {
              playRotateSound();
              dispatch({ type: 'FLIP' });
            }}
          />

          {state.phase === 'replay' && (
            <ReplayControlBar
              totalSteps={state.history.length}
              currentStep={state.historyIndex}
              onStep={(idx) => dispatch({ type: 'REPLAY_STEP', targetIndex: idx })}
              onExit={() => dispatch({ type: 'REPLAY_EXIT' })}
            />
          )}
        </div>

        <PieceTray
          color={currentSeat?.color ?? '#42b6ff'}
          colorId={currentSeat?.id ?? 0}
          colorblindMode={prefs.colorblindMode}
          available={currentSeat?.available ?? []}
          playablePieces={playablePieces}
          selectedPiece={state.selectedPiece}
          rotation={state.rotation}
          flipped={state.flipped}
          sizeFilter={state.sizeFilter}
          canHumanAct={canHumanAct}
          canUndo={state.historyIndex > 0 && state.phase === 'playing'}
          canRedo={state.historyIndex < state.history.length && state.phase === 'playing'}
          onSelectPiece={(pieceId) => {
            playSelectSound();
            dispatch({ type: 'SELECT_PIECE', pieceId });
          }}
          onRotate={() => {
            playRotateSound();
            dispatch({ type: 'ROTATE', delta: 1 });
          }}
          onFlip={() => {
            playRotateSound();
            dispatch({ type: 'FLIP' });
          }}
          onConfirmPlace={() => dispatch({ type: 'CONFIRM_CURSOR_PLACE', snap: prefs.snapToCorner })}
          onSetSizeFilter={(sz) => dispatch({ type: 'SET_SIZE_FILTER', size: sz })}
          onUndo={() => dispatch({ type: 'UNDO' })}
          onRedo={() => dispatch({ type: 'REDO' })}
          onDragBoardPoint={setDragBoardPoint}
          onDropAtBoardPoint={(pointer) =>
            dispatch({ type: 'PLACE_AT_POINTER', pointer, snap: prefs.snapToCorner, isTouch: false })
          }
        />
      </main>

      <MatchModalOverlays
        state={state}
        onReadyHandoff={() => dispatch({ type: 'READY_HANDOFF' })}
        onResume={() => dispatch({ type: 'RESUME' })}
        onRestart={() => dispatch({ type: 'RESTART' })}
        onUndo={() => dispatch({ type: 'UNDO' })}
        onEnterReplay={() => dispatch({ type: 'REPLAY_ENTER' })}
        onNextPuzzle={(puzzleId) =>
          dispatch({
            type: 'START_MATCH',
            config: { ...state.config, mode: 'puzzle', puzzleId },
          })
        }
        onExitMenu={() => dispatch({ type: 'EXIT_TO_MENU' })}
      />
    </div>
  );
}

export default App;
