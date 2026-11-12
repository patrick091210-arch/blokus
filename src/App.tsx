import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  PIECE_BY_ID,
  PUZZLES,
  computePlayablePieces,
  computeStandings,
  computeTeamStandings,
} from './engine/index.ts';
import type { Point } from './engine/index.ts';
import { requestAIMoveAsync } from './ai/workerClient.ts';
import {
  playFlip3DSound,
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
import { getAlliedColorIds } from './state/matchTypes.ts';
import {
  loadActiveMatch,
  loadPreferences,
  loadSolvedPuzzles,
  markPuzzleSolved,
  saveActiveMatch,
  savePreferences,
} from './state/storage.ts';
import type { UserPreferences } from './state/storage.ts';
import { EntryAndSlamStage } from './components/EntryAndSlamStage.tsx';
import type { IntroStage } from './components/EntryAndSlamStage.tsx';
import { BoardStage } from './components/BoardStage.tsx';
import { PieceTray } from './components/PieceTray.tsx';
import type { TransformAnimEvent } from './components/PieceTray.tsx';

export function App() {
  const [prefs, setPrefs] = useState<UserPreferences>(() => {
    const loaded = loadPreferences();
    setSoundMuted(loaded.soundMuted);
    return loaded;
  });

  const [introStage, setIntroStage] = useState<IntroStage>('entry');
  const [savedMatch, setSavedMatch] = useState(() => loadActiveMatch());
  const [solvedPuzzles, setSolvedPuzzles] = useState(() => loadSolvedPuzzles());

  const [isPiecePickedUp, setIsPiecePickedUp] = useState(false);
  const [pointerClient, setPointerClient] = useState<{ x: number; y: number } | null>(null);
  const [dragBoardPoint, setDragBoardPoint] = useState<Point | null>(null);
  const [transformEvent, setTransformEvent] = useState<TransformAnimEvent>({
    serial: 0,
    kind: 'cw',
  });

  const [state, dispatch] = useReducer(matchReducer, undefined, () => createMenuState());

  // Sync theme attribute on root element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', prefs.surfaceTheme);
  }, [prefs.surfaceTheme]);

  const updatePrefs = useCallback((patch: Partial<UserPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      setSoundMuted(next.soundMuted);
      savePreferences(next);
      return next;
    });
  }, []);

  const canHumanAct = canHumanActNow(state);
  const currentSeat = state.players[state.turn];
  const isGameOver = state.phase === 'gameover';

  const playablePieces = useMemo(() => {
    if (!currentSeat || state.phase !== 'playing') return new Set<string>();
    return computePlayablePieces(state.board, state.turn, currentSeat.available);
  }, [currentSeat, state.board, state.phase, state.turn]);

  const winnerColorIds = useMemo(() => {
    if (!isGameOver) return new Set<number>();
    if (state.config.mode === 'puzzle') {
      return state.puzzleSolved ? new Set<number>([0]) : new Set<number>();
    }
    if (state.config.mode === 'tournament_1v1') {
      const teams = computeTeamStandings(state.players, 'official');
      const ids = new Set<number>();
      teams.filter((t) => t.isWinner).forEach((t) => t.colorIds.forEach((cid) => ids.add(cid)));
      return ids;
    }
    const standings = computeStandings(state.players, 'official');
    return new Set<number>(standings.filter((s) => s.isWinner).map((s) => s.id));
  }, [isGameOver, state.config.mode, state.players, state.puzzleSolved]);

  // Reset held piece whenever turn advances or session restarts
  useEffect(() => {
    setIsPiecePickedUp(false);
    setDragBoardPoint(null);
  }, [state.turn, state.movesPlayed, state.sessionId, state.phase]);

  // Track pointer globally only while holding a piece
  useEffect(() => {
    if (!isPiecePickedUp) return;
    const onMove = (e: PointerEvent) => {
      setPointerClient({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [isPiecePickedUp]);

  // Audio feedback & persistence
  const prevMoveSerial = useRef(0);
  const prevErrorSerial = useRef(0);
  const recordedSession = useRef(0);

  useEffect(() => {
    if (state.lastMove && state.lastMove.serial !== prevMoveSerial.current) {
      prevMoveSerial.current = state.lastMove.serial;
      const sz = PIECE_BY_ID[state.lastMove.pieceId]?.size ?? 4;
      playPlaceSound(sz);
    }
  }, [state.lastMove]);

  useEffect(() => {
    if (state.errorSerial !== prevErrorSerial.current) {
      prevErrorSerial.current = state.errorSerial;
      if (state.errorSerial > 0) playInvalidSound();
    }
  }, [state.errorSerial]);

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
    } else if (state.phase === 'gameover' && recordedSession.current !== state.sessionId) {
      recordedSession.current = state.sessionId;
      saveActiveMatch(null);
      setSavedMatch(null);
      if (state.config.mode !== 'puzzle' || state.puzzleSolved) {
        playVictorySound();
      }
      if (state.config.mode === 'puzzle' && state.puzzleSolved && state.config.puzzleId) {
        setSolvedPuzzles(markPuzzleSolved(state.config.puzzleId));
      }
    }
  }, [
    state.clocksMs,
    state.config,
    state.history,
    state.historyIndex,
    state.phase,
    state.puzzleSolved,
    state.sessionId,
  ]);

  // Non-blocking Web Worker AI turn execution
  useEffect(() => {
    if (state.phase !== 'playing') return;
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
      maxTimeMs: 220,
    });

    let timerId: number | null = null;
    void promise.then((move) => {
      const pacing = Math.max(0, 220 - (performance.now() - startTs));
      timerId = window.setTimeout(() => {
        dispatch({ type: 'AI_MOVE_RESOLVED', sessionId, colorId, move });
      }, pacing);
    });

    return () => {
      cancel();
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [state.board, state.config.difficulty, state.config.mode, state.phase, state.players, state.sessionId, state.turn]);

  const performRotate = useCallback(
    (delta: 1 | -1 = 1) => {
      if (!canHumanAct || !state.selectedPiece) return;
      playRotateSound();
      setTransformEvent((ev) => ({ serial: ev.serial + 1, kind: delta === -1 ? 'ccw' : 'cw' }));
      if (!prefs.hasUsedTransform) updatePrefs({ hasUsedTransform: true });
      dispatch({ type: 'ROTATE', delta });
    },
    [canHumanAct, prefs.hasUsedTransform, state.selectedPiece, updatePrefs],
  );

  const performFlip = useCallback(() => {
    if (!canHumanAct || !state.selectedPiece) return;
    playFlip3DSound();
    setTransformEvent((ev) => ({ serial: ev.serial + 1, kind: 'flip' }));
    if (!prefs.hasUsedTransform) updatePrefs({ hasUsedTransform: true });
    dispatch({ type: 'FLIP' });
  }, [canHumanAct, prefs.hasUsedTransform, state.selectedPiece, updatePrefs]);

  // Intuitive In-Game Keyboard Controls (R rotate, Space/F 3D flip, Z undo, ESC put down / modes)
  useEffect(() => {
    if (state.phase === 'start') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isPiecePickedUp) {
          setIsPiecePickedUp(false);
        } else {
          setIntroStage('modes');
          dispatch({ type: 'EXIT_TO_MENU' });
        }
        return;
      }
      if (key === 'r') {
        e.preventDefault();
        performRotate(e.shiftKey ? -1 : 1);
      } else if (e.key === ' ' || key === 'f') {
        e.preventDefault();
        performFlip();
      } else if (key === 'z') {
        e.preventDefault();
        dispatch({ type: 'UNDO' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPiecePickedUp, performFlip, performRotate, state.phase]);

  const humanPlacedMoves = currentSeat?.placedPieces ?? 0;
  const showMicroGuide =
    state.phase === 'playing' &&
    canHumanAct &&
    !prefs.hasUsedTransform &&
    humanPlacedMoves < 2;

  return (
    <div className="studio-canvas relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden">
      {/* Whisper-Quiet Top-Right Corner Controls: Tiny Black/White Theme Dot + Mute Glyph */}
      <div className="fixed right-6 top-6 z-40 flex items-center gap-4">
        <button
          type="button"
          aria-label="Toggle light and dark surface"
          title="Theme"
          onClick={() =>
            updatePrefs({ surfaceTheme: prefs.surfaceTheme === 'dark' ? 'light' : 'dark' })
          }
          className="flex h-6 w-6 items-center justify-center opacity-35 transition-opacity duration-300 hover:opacity-95"
        >
          <span
            className="block h-2.5 w-2.5 rounded-full transition-transform duration-300 hover:scale-125"
            style={{
              backgroundColor: prefs.surfaceTheme === 'dark' ? '#f2efe9' : '#141920',
              boxShadow: '0 0 0 1.5px var(--fg-whisper)',
            }}
          />
        </button>

        <button
          type="button"
          aria-label={prefs.soundMuted ? 'Unmute sound' : 'Mute sound'}
          onClick={() => updatePrefs({ soundMuted: !prefs.soundMuted })}
          className="flex h-6 w-6 items-center justify-center opacity-30 transition-opacity duration-300 hover:opacity-95"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 6.2H5.6L9.2 3.2V12.8L5.6 9.8H3V6.2Z" />
            {prefs.soundMuted ? (
              <path d="M11.5 6L14.5 10M14.5 6L11.5 10" strokeLinecap="round" />
            ) : (
              <path d="M11.8 5.2C12.9 6.3 12.9 9.7 11.8 10.8" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {state.phase === 'start' ? (
        <EntryAndSlamStage
          stage={introStage}
          surfaceTheme={prefs.surfaceTheme}
          solvedPuzzles={solvedPuzzles}
          hasSavedMatch={Boolean(savedMatch)}
          onChangeStage={setIntroStage}
          onStartMatch={(cfg) => dispatch({ type: 'START_MATCH', config: cfg })}
          onResumeSaved={() => {
            if (savedMatch) dispatch({ type: 'LOAD_SAVED_MATCH', saved: savedMatch });
          }}
        />
      ) : (
        <>
          {/* Whisper-Quiet Top-Left In-Game Micro-Controls (Modes & Undo) */}
          <div className="fixed left-6 top-6 z-40 flex items-center gap-3.5">
            <button
              type="button"
              aria-label="Modes"
              onClick={() => {
                setIntroStage('modes');
                dispatch({ type: 'EXIT_TO_MENU' });
              }}
              className="flex h-7 w-7 items-center justify-center text-sm opacity-30 transition-opacity duration-300 hover:opacity-95"
            >
              ‹
            </button>
            {state.historyIndex > 0 && !isGameOver && (
              <button
                type="button"
                aria-label="Undo"
                onClick={() => dispatch({ type: 'UNDO' })}
                className="flex h-7 w-7 items-center justify-center text-xs opacity-28 transition-opacity duration-300 hover:opacity-95"
              >
                ↶
              </button>
            )}
          </div>

          {/* Centered Invisible-UI Arena: Board + Frameless Floating Piece Dock */}
          <main className="flex h-full w-full flex-col items-center justify-center gap-8 px-6 lg:flex-row lg:gap-20">
            <div className="relative flex flex-col items-center">
              <BoardStage
                board={state.board}
                players={state.players}
                turn={state.turn}
                isGameOver={isGameOver}
                winnerColorIds={winnerColorIds}
                canHumanAct={canHumanAct}
                isPiecePickedUp={isPiecePickedUp}
                selectedPiece={state.selectedPiece}
                rotation={state.rotation}
                flipped={state.flipped}
                externalDragPoint={dragBoardPoint}
                lastMove={state.lastMove}
                onPlaceAtPointer={(pointer) =>
                  dispatch({ type: 'PLACE_AT_POINTER', pointer, snap: true, isTouch: false })
                }
                onRotate={performRotate}
                onFlip={performFlip}
              />

              {/* Modal-Free Minimalist Endgame Actions */}
              {isGameOver && (
                <div
                  className="mt-3 flex items-center gap-10 text-xs font-medium tracking-[0.3em] transition-all duration-500"
                  style={{ animation: 'tile-land 450ms var(--ease-spring) both' }}
                >
                  {state.config.mode === 'puzzle' && state.puzzleSolved ? (
                    <button
                      type="button"
                      onClick={() => {
                        const curIdx = PUZZLES.findIndex((p) => p.id === state.config.puzzleId);
                        const nextPz = PUZZLES[(curIdx + 1) % PUZZLES.length];
                        dispatch({
                          type: 'START_MATCH',
                          config: { ...state.config, mode: 'puzzle', puzzleId: nextPz.id },
                        });
                      }}
                      className="py-2 pl-[0.3em] opacity-75 transition hover:opacity-100"
                    >
                      NEXT
                    </button>
                  ) : state.config.mode === 'puzzle' && state.puzzleFailed ? (
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'UNDO' })}
                      className="py-2 pl-[0.3em] opacity-75 transition hover:opacity-100"
                    >
                      UNDO
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'RESTART' })}
                      className="py-2 pl-[0.3em] opacity-75 transition hover:opacity-100"
                    >
                      AGAIN
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setIntroStage('modes');
                      dispatch({ type: 'EXIT_TO_MENU' });
                    }}
                    className="py-2 pl-[0.3em] opacity-45 transition hover:opacity-100"
                  >
                    MODES
                  </button>
                </div>
              )}
            </div>

            {!isGameOver && (
              <PieceTray
                color={currentSeat?.color ?? '#1684ff'}
                available={currentSeat?.available ?? []}
                playablePieces={playablePieces}
                selectedPiece={state.selectedPiece}
                isPiecePickedUp={isPiecePickedUp}
                rotation={state.rotation}
                flipped={state.flipped}
                transformEvent={transformEvent}
                pointerClient={pointerClient}
                canHumanAct={canHumanAct}
                isGameOver={isGameOver}
                onPickPiece={(pieceId, clientX, clientY) => {
                  playSelectSound();
                  setPointerClient({ x: clientX, y: clientY });
                  if (state.selectedPiece !== pieceId) {
                    dispatch({ type: 'SELECT_PIECE', pieceId });
                  }
                  setIsPiecePickedUp(true);
                }}
                onDragBoardPoint={setDragBoardPoint}
                onDropAtBoardPoint={(pointer) =>
                  dispatch({ type: 'PLACE_AT_POINTER', pointer, snap: true, isTouch: false })
                }
              />
            )}
          </main>

          {/* One-Time Whisper-Low-Contrast Micro-Hint (Permanently fades after first rotate/flip or 2 turns) */}
          <div
            className="pointer-events-none fixed bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-medium tracking-[0.28em] transition-opacity duration-700"
            style={{
              color: 'var(--fg-whisper)',
              opacity: showMicroGuide ? 1 : 0,
            }}
          >
            R ↻ &nbsp;&nbsp;&nbsp; SPACE ⇄
          </div>
        </>
      )}
    </div>
  );
}

export default App;
