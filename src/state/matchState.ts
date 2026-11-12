import {
  PUZZLES,
  PUZZLE_BY_ID,
  applyPlacementToBoard,
  createClassicBoard,
  findAnyLegalMoveOnBoard,
  getNextFlipTransform,
  getNextRotationTransform,
  getPointFromAnchor,
  getShape,
  hasColorStarted,
  resolveGhostPlacement,
  validatePlacementOnBoard,
} from '../engine/index.ts';
import type { Move } from '../engine/index.ts';
import type { MatchActionEntry, MatchSetupConfig } from './storage.ts';
import {
  buildInitialBoardAndPlayers,
  getClockTimings,
  prepareTurnSelection,
  reconstructBoardAtIndex,
} from './matchTypes.ts';
import type { MatchAction, MatchState } from './matchTypes.ts';

export const DEFAULT_SETUP_CONFIG: MatchSetupConfig = {
  mode: 'solo',
  difficulty: 'medium',
  opponentType: 'ai',
  clockPreset: 'off',
  scoringRule: 'official',
};

export function createMenuState(config: MatchSetupConfig = DEFAULT_SETUP_CONFIG): MatchState {
  return {
    phase: 'start',
    config,
    sessionId: 0,
    board: createClassicBoard(),
    players: [],
    turn: 0,
    selectedPiece: null,
    rotation: 0,
    flipped: false,
    sizeFilter: null,
    cursor: { x: 0, y: 0 },
    touchArmedAnchor: null,
    movesPlayed: 0,
    history: [],
    historyIndex: 0,
    clocksMs: null,
    incrementMs: 0,
    handoff: false,
    skippedNotice: null,
    message: '',
    lastMove: null,
    errorSerial: 0,
    puzzleSolved: false,
    puzzleFailed: false,
  };
}

export function isSeatHumanControlled(state: MatchState, colorId: number): boolean {
  const player = state.players[colorId];
  return Boolean(player && player.isHuman && !player.aiAutoplay);
}

export function canHumanActNow(state: MatchState): boolean {
  return state.phase === 'playing' && !state.handoff && isSeatHumanControlled(state, state.turn);
}

export function startNewMatchState(config: MatchSetupConfig): MatchState {
  const { board, players } = buildInitialBoardAndPlayers(config);
  const timings = config.mode === 'puzzle' ? null : getClockTimings(config.clockPreset);
  const clocksMs = timings ? players.map(() => timings.initialMs) : null;
  const selection = prepareTurnSelection(board, players[0], null);

  let openMsg = 'Cover your starting corner with your first piece.';
  if (config.mode === 'blokus_duo') {
    openMsg = 'Blokus Duo 14×14: cover your inner start anchor at (5, 5).';
  } else if (config.mode === 'puzzle') {
    const pz = PUZZLE_BY_ID[config.puzzleId ?? ''] ?? PUZZLES[0];
    openMsg = `${pz.title} — ${pz.subtitle}`;
  } else if (config.mode === 'tournament_1v1') {
    openMsg = '1v1 Tournament: you command Blue & Coral; scores combine at the end.';
  }

  return {
    phase: 'playing',
    config,
    sessionId: Date.now() + Math.floor(Math.random() * 10_000),
    board,
    players,
    turn: 0,
    ...selection,
    sizeFilter: null,
    touchArmedAnchor: null,
    movesPlayed: 0,
    history: [],
    historyIndex: 0,
    clocksMs,
    incrementMs: timings?.incrementMs ?? 0,
    handoff: false,
    skippedNotice: null,
    message: openMsg,
    lastMove: null,
    errorSerial: 0,
    puzzleSolved: false,
    puzzleFailed: false,
  };
}

function advanceAfterMoveOrTimeout(
  state: MatchState,
  actingColorId: number,
  board: MatchState['board'],
  players: MatchState['players'][number][],
  history: MatchActionEntry[],
  clocksMs: number[] | null,
  lastMove: MatchState['lastMove'],
  movesPlayed: number,
  prefixNotice?: string,
): MatchState {
  // Puzzle completion / deadlock check
  if (state.config.mode === 'puzzle') {
    const p0 = players[0];
    if (p0.available.length === 0) {
      return {
        ...state,
        phase: 'gameover',
        board,
        players,
        history,
        historyIndex: history.length,
        clocksMs,
        lastMove,
        movesPlayed,
        selectedPiece: null,
        touchArmedAnchor: null,
        puzzleSolved: true,
        puzzleFailed: false,
        message: 'Puzzle solved! Every piece fit cleanly.',
      };
    }
    const stillPlayable = findAnyLegalMoveOnBoard(board, 0, p0.available);
    if (!stillPlayable) {
      return {
        ...state,
        phase: 'gameover',
        board,
        players,
        history,
        historyIndex: history.length,
        clocksMs,
        lastMove,
        movesPlayed,
        selectedPiece: null,
        touchArmedAnchor: null,
        puzzleSolved: false,
        puzzleFailed: true,
        message: 'No legal pocket left for your remaining pieces — press Undo to try another angle!',
      };
    }
    const sel = prepareTurnSelection(board, p0, state.sizeFilter);
    return {
      ...state,
      board,
      players,
      turn: 0,
      ...sel,
      touchArmedAnchor: null,
      history,
      historyIndex: history.length,
      clocksMs,
      lastMove,
      movesPlayed,
      message: `${p0.available.length} piece${p0.available.length > 1 ? 's' : ''} remaining.`,
    };
  }

  // Multi-color turn advancement: auto-pass any seat with zero legal moves synchronously
  const colorCount = players.length;
  const autoSkippedNames: string[] = prefixNotice ? [prefixNotice] : [];
  let nextTurn = -1;

  for (let offset = 1; offset <= colorCount; offset += 1) {
    const cid = (actingColorId + offset) % colorCount;
    const cand = players[cid];
    if (cand.passed || cand.available.length === 0) {
      if (!cand.passed) {
        players[cid] = { ...cand, passed: true };
      }
      continue;
    }
    const hasMove = Boolean(findAnyLegalMoveOnBoard(board, cid, cand.available));
    if (!hasMove) {
      players[cid] = { ...cand, passed: true };
      history.push({ kind: 'pass', colorId: cid });
      autoSkippedNames.push(`${cand.name} passed (no legal space)`);
      continue;
    }
    nextTurn = cid;
    break;
  }

  if (nextTurn === -1) {
    return {
      ...state,
      phase: 'gameover',
      board,
      players,
      history,
      historyIndex: history.length,
      clocksMs,
      lastMove,
      movesPlayed,
      handoff: false,
      selectedPiece: null,
      touchArmedAnchor: null,
      skippedNotice: autoSkippedNames.length > 0 ? autoSkippedNames.join(' · ') : null,
      message: 'All corners claimed — final standings ready.',
    };
  }

  const nextPlayer = players[nextTurn];
  const nextIsHuman = nextPlayer.isHuman && !nextPlayer.aiAutoplay;
  const needsHandoff = false;

  const sel = nextIsHuman
    ? prepareTurnSelection(board, nextPlayer, state.sizeFilter)
    : { selectedPiece: null, rotation: 0, flipped: false, cursor: state.cursor };

  const skippedNotice = autoSkippedNames.length > 0 ? autoSkippedNames.join(' · ') : null;
  const statusMsg = nextIsHuman
    ? `${nextPlayer.name}'s turn${skippedNotice ? ` (${skippedNotice})` : ''}.`
    : `${nextPlayer.name} is calculating…`;

  return {
    ...state,
    board,
    players,
    turn: nextTurn,
    ...sel,
    touchArmedAnchor: null,
    history,
    historyIndex: history.length,
    clocksMs,
    lastMove,
    movesPlayed,
    handoff: needsHandoff,
    skippedNotice,
    message: statusMsg,
  };
}

function executeMove(state: MatchState, colorId: number, move: Move, fromAI: boolean): MatchState {
  if (state.phase !== 'playing' || colorId !== state.turn) return state;
  const player = state.players[colorId];
  if (!player || !player.available.includes(move.pieceId)) return state;
  if (fromAI && isSeatHumanControlled(state, colorId)) return state;
  if (!fromAI && !canHumanActNow(state)) return state;

  const shape = getShape(move.pieceId, move.rotation, move.flipped);
  const anchor = { x: move.x, y: move.y };
  const startedBefore = hasColorStarted(state.board, colorId);
  const check = validatePlacementOnBoard(state.board, colorId, shape, anchor, startedBefore);

  if (!check.valid) {
    return {
      ...state,
      message: check.reason ?? 'Invalid placement.',
      errorSerial: state.errorSerial + 1,
    };
  }

  const nextBoard = applyPlacementToBoard(state.board, colorId, shape, anchor, startedBefore);
  const placedCells = shape.map((c) => ({ x: anchor.x + c.x, y: anchor.y + c.y }));
  const nextPlayers = state.players.map((p) =>
    p.id === colorId
      ? {
          ...p,
          available: p.available.filter((id) => id !== move.pieceId),
          placedSquares: p.placedSquares + shape.length,
          placedPieces: p.placedPieces + 1,
          lastPiece: move.pieceId,
          passed: false,
        }
      : p,
  );

  const nextHistory: MatchActionEntry[] = [
    ...state.history.slice(0, state.historyIndex),
    { kind: 'place', colorId, move },
  ];

  const nextClocks = state.clocksMs ? state.clocksMs.slice() : null;
  if (nextClocks && nextClocks[colorId] > 0) {
    nextClocks[colorId] += state.incrementMs;
  }

  const lastMove = {
    serial: state.movesPlayed + 1,
    colorId,
    pieceId: move.pieceId,
    cells: placedCells,
  };

  return advanceAfterMoveOrTimeout(
    state,
    colorId,
    nextBoard,
    nextPlayers,
    nextHistory,
    nextClocks,
    lastMove,
    state.movesPlayed + 1,
  );
}

export function matchReducer(state: MatchState, action: MatchAction): MatchState {
  switch (action.type) {
    case 'START_MATCH':
      return startNewMatchState(action.config);

    case 'RESTART':
      return startNewMatchState(state.config);

    case 'EXIT_TO_MENU':
      return createMenuState(state.config);

    case 'SET_SCORING_RULE':
      return {
        ...state,
        config: { ...state.config, scoringRule: action.scoringRule },
      };

    case 'LOAD_SAVED_MATCH': {
      const { config, history, historyIndex, clocksMs } = action.saved;
      const base = startNewMatchState(config);
      const recon = reconstructBoardAtIndex(config, history, historyIndex);
      const anyMovesLeft = recon.players.some(
        (p) => !p.passed && findAnyLegalMoveOnBoard(recon.board, p.id, p.available),
      );
      const sel = prepareTurnSelection(recon.board, recon.players[recon.turn], null);
      return {
        ...base,
        phase: anyMovesLeft ? 'playing' : 'gameover',
        board: recon.board,
        players: recon.players,
        turn: recon.turn,
        ...sel,
        movesPlayed: recon.movesPlayed,
        lastMove: recon.lastMove,
        history: [...history],
        historyIndex: Math.min(history.length, historyIndex),
        clocksMs: clocksMs ? [...clocksMs] : base.clocksMs,
        message: 'Match restored from auto-save.',
      };
    }

    case 'IMPORT_MATCH': {
      const base = startNewMatchState(action.config);
      const recon = reconstructBoardAtIndex(action.config, action.history, action.history.length);
      const anyMovesLeft = recon.players.some(
        (p) => !p.passed && findAnyLegalMoveOnBoard(recon.board, p.id, p.available),
      );
      const sel = prepareTurnSelection(recon.board, recon.players[recon.turn], null);
      const targetPhase = action.openInReplay
        ? 'replay'
        : anyMovesLeft
          ? 'playing'
          : 'gameover';
      return {
        ...base,
        phase: targetPhase,
        board: recon.board,
        players: recon.players,
        turn: recon.turn,
        ...sel,
        movesPlayed: recon.movesPlayed,
        lastMove: recon.lastMove,
        history: [...action.history],
        historyIndex: action.history.length,
        message: action.openInReplay ? 'Replay loaded from share code.' : 'Match imported successfully.',
      };
    }

    case 'PAUSE':
      return state.phase === 'playing' ? { ...state, phase: 'paused' } : state;

    case 'RESUME':
      return state.phase === 'paused' ? { ...state, phase: 'playing' } : state;

    case 'READY_HANDOFF': {
      if (!state.handoff) return state;
      const cur = state.players[state.turn];
      const sel = prepareTurnSelection(state.board, cur, state.sizeFilter);
      return {
        ...state,
        handoff: false,
        skippedNotice: null,
        ...(state.selectedPiece ? {} : sel),
        message: `${cur?.name ?? 'Player'} — select and place a piece.`,
      };
    }

    case 'SELECT_PIECE': {
      if (!canHumanActNow(state)) return state;
      const cur = state.players[state.turn];
      if (!cur?.available.includes(action.pieceId)) return state;
      if (state.selectedPiece === action.pieceId) {
        const rot = getNextRotationTransform(action.pieceId, state.rotation, state.flipped);
        return {
          ...state,
          rotation: rot.rotation,
          flipped: rot.flipped,
          touchArmedAnchor: null,
          message: rot.changed ? `${action.pieceId} rotated.` : `${action.pieceId} is symmetric.`,
        };
      }
      return {
        ...state,
        selectedPiece: action.pieceId,
        rotation: 0,
        flipped: false,
        touchArmedAnchor: null,
        message: `Piece ${action.pieceId} selected — R rotate, F mirror.`,
      };
    }

    case 'DESELECT_PIECE':
      if (!state.selectedPiece) return state;
      return {
        ...state,
        selectedPiece: null,
        touchArmedAnchor: null,
        message: 'Piece deselected. Pick another from your tray.',
      };

    case 'ROTATE': {
      if (!canHumanActNow(state) || !state.selectedPiece) return state;
      let rot = getNextRotationTransform(state.selectedPiece, state.rotation, state.flipped);
      if (action.delta === -1 && rot.changed) {
        // 3 forward unique steps or reverse rotation
        const r2 = getNextRotationTransform(state.selectedPiece, rot.rotation, rot.flipped);
        const r3 = getNextRotationTransform(state.selectedPiece, r2.rotation, r2.flipped);
        if (r3.rotation !== state.rotation || r3.flipped !== state.flipped) {
          rot = r3;
        }
      }
      return {
        ...state,
        rotation: rot.rotation,
        flipped: rot.flipped,
        touchArmedAnchor: null,
        message: rot.changed ? 'Piece rotated.' : 'Symmetric under rotation.',
      };
    }

    case 'FLIP': {
      if (!canHumanActNow(state) || !state.selectedPiece) return state;
      const fl = getNextFlipTransform(state.selectedPiece, state.rotation, state.flipped);
      return {
        ...state,
        rotation: fl.rotation,
        flipped: fl.flipped,
        touchArmedAnchor: null,
        message: fl.changed ? 'Piece mirrored.' : 'Mirror-symmetric in this orientation.',
      };
    }

    case 'SET_SIZE_FILTER': {
      const nextFilter = state.sizeFilter === action.size ? null : action.size;
      return { ...state, sizeFilter: nextFilter };
    }

    case 'MOVE_CURSOR': {
      if (!canHumanActNow(state)) return state;
      const limit = state.board.size - 1;
      return {
        ...state,
        cursor: {
          x: Math.max(0, Math.min(limit, state.cursor.x + action.dx)),
          y: Math.max(0, Math.min(limit, state.cursor.y + action.dy)),
        },
        touchArmedAnchor: null,
      };
    }

    case 'PLACE_AT_POINTER': {
      if (!canHumanActNow(state) || !state.selectedPiece) return state;
      const started = hasColorStarted(state.board, state.turn);
      const ghost = resolveGhostPlacement(
        state.board,
        state.turn,
        state.selectedPiece,
        state.rotation,
        state.flipped,
        action.pointer,
        started,
        action.snap ? 2 : 0,
      );
      const nextCursor = getPointFromAnchor(ghost.shape, ghost.anchor, state.board.size);

      if (action.isTouch) {
        const armed = state.touchArmedAnchor;
        if (!armed || armed.x !== ghost.anchor.x || armed.y !== ghost.anchor.y) {
          return {
            ...state,
            cursor: nextCursor,
            touchArmedAnchor: ghost.anchor,
            message: ghost.validation.valid
              ? 'Tap same spot again (or Place) to confirm.'
              : ghost.validation.reason ?? 'Cannot place there.',
          };
        }
      }

      return executeMove(
        { ...state, cursor: nextCursor },
        state.turn,
        {
          pieceId: state.selectedPiece,
          x: ghost.anchor.x,
          y: ghost.anchor.y,
          rotation: state.rotation,
          flipped: state.flipped,
        },
        false,
      );
    }

    case 'CONFIRM_CURSOR_PLACE': {
      if (!canHumanActNow(state) || !state.selectedPiece) return state;
      const started = hasColorStarted(state.board, state.turn);
      const ghost = resolveGhostPlacement(
        state.board,
        state.turn,
        state.selectedPiece,
        state.rotation,
        state.flipped,
        state.cursor,
        started,
        action.snap ? 2 : 0,
      );
      return executeMove(
        state,
        state.turn,
        {
          pieceId: state.selectedPiece,
          x: ghost.anchor.x,
          y: ghost.anchor.y,
          rotation: state.rotation,
          flipped: state.flipped,
        },
        false,
      );
    }

    case 'AI_MOVE_RESOLVED': {
      if (state.phase !== 'playing' || action.sessionId !== state.sessionId || action.colorId !== state.turn) {
        return state;
      }
      if (isSeatHumanControlled(state, action.colorId)) return state;
      if (!action.move) {
        const nextPlayers = state.players.map((p) =>
          p.id === action.colorId ? { ...p, passed: true } : p,
        );
        const nextHistory: MatchActionEntry[] = [
          ...state.history.slice(0, state.historyIndex),
          { kind: 'pass', colorId: action.colorId },
        ];
        return advanceAfterMoveOrTimeout(
          state,
          action.colorId,
          state.board,
          nextPlayers,
          nextHistory,
          state.clocksMs ? state.clocksMs.slice() : null,
          state.lastMove,
          state.movesPlayed,
          `${state.players[action.colorId]?.name ?? 'AI'} passed`,
        );
      }
      return executeMove(state, action.colorId, action.move, true);
    }

    case 'TOGGLE_AI_AUTOPLAY': {
      const target = state.players[action.colorId];
      if (!target || !target.isHuman) return state;
      const nextPlayers = state.players.map((p) =>
        p.id === action.colorId ? { ...p, aiAutoplay: !p.aiAutoplay } : p,
      );
      const toggledOn = !target.aiAutoplay;
      return {
        ...state,
        sessionId: state.sessionId + 1,
        players: nextPlayers,
        handoff: action.colorId === state.turn && toggledOn ? false : state.handoff,
        message: toggledOn
          ? `AI Autoplay enabled for ${target.name}.`
          : `Manual control restored for ${target.name}.`,
      };
    }

    case 'TICK_CLOCK': {
      if (state.phase !== 'playing' || state.handoff || !state.clocksMs) return state;
      const curClock = state.clocksMs[state.turn];
      if (curClock === undefined || curClock <= 0) return state;
      const nextClocks = state.clocksMs.slice();
      nextClocks[state.turn] = Math.max(0, curClock - action.elapsedMs);
      if (nextClocks[state.turn] > 0) {
        return { ...state, clocksMs: nextClocks };
      }
      // Flag fall: seat forfeits remaining placements
      const timedOutPlayer = state.players[state.turn];
      const nextPlayers = state.players.map((p) =>
        p.id === state.turn ? { ...p, passed: true } : p,
      );
      const nextHistory: MatchActionEntry[] = [
        ...state.history.slice(0, state.historyIndex),
        { kind: 'pass', colorId: state.turn },
      ];
      return advanceAfterMoveOrTimeout(
        state,
        state.turn,
        state.board,
        nextPlayers,
        nextHistory,
        nextClocks,
        state.lastMove,
        state.movesPlayed,
        `${timedOutPlayer?.name ?? 'Player'} flagged on time`,
      );
    }

    case 'UNDO': {
      if (state.historyIndex <= 0 || (state.phase !== 'playing' && state.phase !== 'gameover')) {
        return state;
      }
      // Rewind to the most recent human-controlled placement so solo players don't undo into an AI turn
      let targetIdx = state.historyIndex - 1;
      while (targetIdx > 0) {
        const entry = state.history[targetIdx];
        const seat = state.players[entry.colorId];
        if (entry.kind === 'place' && seat?.isHuman && !seat.aiAutoplay) {
          break;
        }
        targetIdx -= 1;
      }
      const recon = reconstructBoardAtIndex(state.config, state.history, targetIdx, state.players);
      const sel = prepareTurnSelection(recon.board, recon.players[recon.turn], state.sizeFilter);
      return {
        ...state,
        phase: 'playing',
        sessionId: state.sessionId + 1,
        board: recon.board,
        players: recon.players,
        turn: recon.turn,
        ...sel,
        touchArmedAnchor: null,
        movesPlayed: recon.movesPlayed,
        lastMove: recon.lastMove,
        historyIndex: targetIdx,
        handoff: false,
        puzzleSolved: false,
        puzzleFailed: false,
        message: `Undid back to move ${targetIdx}.`,
      };
    }

    case 'REDO': {
      if (state.phase !== 'playing' || state.historyIndex >= state.history.length) {
        return state;
      }
      let targetIdx = state.historyIndex + 1;
      while (targetIdx < state.history.length) {
        const nextEntry = state.history[targetIdx];
        const seat = state.players[nextEntry.colorId];
        if (nextEntry.kind === 'place' && seat?.isHuman && !seat.aiAutoplay) {
          break;
        }
        targetIdx += 1;
      }
      const recon = reconstructBoardAtIndex(state.config, state.history, targetIdx, state.players);
      const anyLeft = recon.players.some(
        (p) => !p.passed && findAnyLegalMoveOnBoard(recon.board, p.id, p.available),
      );
      const sel = prepareTurnSelection(recon.board, recon.players[recon.turn], state.sizeFilter);
      return {
        ...state,
        phase: anyLeft ? 'playing' : 'gameover',
        sessionId: state.sessionId + 1,
        board: recon.board,
        players: recon.players,
        turn: recon.turn,
        ...sel,
        touchArmedAnchor: null,
        movesPlayed: recon.movesPlayed,
        lastMove: recon.lastMove,
        historyIndex: targetIdx,
        handoff: false,
        message: `Redid forward to step ${targetIdx}.`,
      };
    }

    case 'REPLAY_ENTER': {
      const recon = reconstructBoardAtIndex(state.config, state.history, state.history.length, state.players);
      return {
        ...state,
        phase: 'replay',
        sessionId: state.sessionId + 1,
        board: recon.board,
        players: recon.players,
        turn: recon.turn,
        movesPlayed: recon.movesPlayed,
        lastMove: recon.lastMove,
        historyIndex: state.history.length,
        selectedPiece: null,
        handoff: false,
        message: `Time-Machine Replay (${state.history.length} steps)`,
      };
    }

    case 'REPLAY_STEP': {
      if (state.phase !== 'replay') return state;
      const clamped = Math.max(0, Math.min(state.history.length, action.targetIndex));
      const recon = reconstructBoardAtIndex(state.config, state.history, clamped, state.players);
      return {
        ...state,
        board: recon.board,
        players: recon.players,
        turn: recon.turn,
        movesPlayed: recon.movesPlayed,
        lastMove: recon.lastMove,
        historyIndex: clamped,
        message: clamped === 0 ? 'Opening board (Step 0)' : `Step ${clamped} of ${state.history.length}`,
      };
    }

    case 'REPLAY_EXIT': {
      const recon = reconstructBoardAtIndex(state.config, state.history, state.history.length, state.players);
      const anyLeft =
        state.config.mode === 'puzzle'
          ? recon.players[0].available.length > 0 &&
            Boolean(findAnyLegalMoveOnBoard(recon.board, 0, recon.players[0].available))
          : recon.players.some(
              (p) => !p.passed && findAnyLegalMoveOnBoard(recon.board, p.id, p.available),
            );
      const sel = prepareTurnSelection(recon.board, recon.players[recon.turn], state.sizeFilter);
      return {
        ...state,
        phase: anyLeft ? 'playing' : 'gameover',
        sessionId: state.sessionId + 1,
        board: recon.board,
        players: recon.players,
        turn: recon.turn,
        ...sel,
        movesPlayed: recon.movesPlayed,
        lastMove: recon.lastMove,
        historyIndex: state.history.length,
        puzzleSolved: state.config.mode === 'puzzle' && recon.players[0].available.length === 0,
      };
    }

    default:
      return state;
  }
}
