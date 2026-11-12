import {
  PIECES,
  PIECES_BY_SIZE_DESC,
  PLAYER_COLORS,
  PLAYER_NAMES,
  PUZZLES,
  PUZZLE_BY_ID,
  applyPlacementToBoard,
  createBoardState,
  createClassicBoard,
  createDuoBoard,
  findAnyLegalMoveOnBoard,
  findLegalMovesForPieceOnBoard,
  getAnchorFromPoint,
  getPointFromAnchor,
  getShape,
  hasColorStarted,
} from '../engine/index.ts';
import type {
  BoardState,
  ColorPlayerState,
  GameMode,
  Move,
  PieceSize,
  Point,
  ScoringRule,
} from '../engine/index.ts';
import type {
  ClockPreset,
  MatchActionEntry,
  MatchSetupConfig,
  SavedActiveMatch,
} from './storage.ts';

export type MatchPhase = 'start' | 'playing' | 'paused' | 'gameover' | 'replay';

export type LastPlacementInfo = {
  readonly serial: number;
  readonly colorId: number;
  readonly pieceId: string;
  readonly cells: readonly Point[];
};

export type MatchState = {
  readonly phase: MatchPhase;
  readonly config: MatchSetupConfig;
  readonly sessionId: number;
  readonly board: BoardState;
  readonly players: readonly ColorPlayerState[];
  readonly turn: number;
  readonly selectedPiece: string | null;
  readonly rotation: number;
  readonly flipped: boolean;
  readonly sizeFilter: PieceSize | null;
  readonly cursor: Point;
  readonly touchArmedAnchor: Point | null;
  readonly movesPlayed: number;
  readonly history: readonly MatchActionEntry[];
  readonly historyIndex: number;
  readonly clocksMs: readonly number[] | null;
  readonly incrementMs: number;
  readonly handoff: boolean;
  readonly skippedNotice: string | null;
  readonly message: string;
  readonly lastMove: LastPlacementInfo | null;
  readonly errorSerial: number;
  readonly puzzleSolved: boolean;
  readonly puzzleFailed: boolean;
};

export type MatchAction =
  | { readonly type: 'START_MATCH'; readonly config: MatchSetupConfig }
  | { readonly type: 'LOAD_SAVED_MATCH'; readonly saved: SavedActiveMatch }
  | { readonly type: 'IMPORT_MATCH'; readonly config: MatchSetupConfig; readonly history: readonly MatchActionEntry[]; readonly openInReplay?: boolean }
  | { readonly type: 'RESTART' }
  | { readonly type: 'EXIT_TO_MENU' }
  | { readonly type: 'PAUSE' }
  | { readonly type: 'RESUME' }
  | { readonly type: 'READY_HANDOFF' }
  | { readonly type: 'SELECT_PIECE'; readonly pieceId: string }
  | { readonly type: 'DESELECT_PIECE' }
  | { readonly type: 'ROTATE'; readonly delta?: 1 | -1 }
  | { readonly type: 'FLIP' }
  | { readonly type: 'SET_SIZE_FILTER'; readonly size: PieceSize | null }
  | { readonly type: 'MOVE_CURSOR'; readonly dx: number; readonly dy: number }
  | { readonly type: 'PLACE_AT_POINTER'; readonly pointer: Point; readonly snap: boolean; readonly isTouch?: boolean }
  | { readonly type: 'CONFIRM_CURSOR_PLACE'; readonly snap: boolean }
  | { readonly type: 'AI_MOVE_RESOLVED'; readonly sessionId: number; readonly colorId: number; readonly move: Move | null }
  | { readonly type: 'TOGGLE_AI_AUTOPLAY'; readonly colorId: number }
  | { readonly type: 'TICK_CLOCK'; readonly elapsedMs: number }
  | { readonly type: 'UNDO' }
  | { readonly type: 'REDO' }
  | { readonly type: 'REPLAY_ENTER' }
  | { readonly type: 'REPLAY_STEP'; readonly targetIndex: number }
  | { readonly type: 'REPLAY_EXIT' }
  | { readonly type: 'SET_SCORING_RULE'; readonly scoringRule: ScoringRule };

export const MODE_LABELS: Readonly<Record<GameMode, string>> = {
  solo: 'Solo Arena (1P + 3 AI)',
  duo_coop: '2P + 2 AI Co-Table',
  tournament_1v1: '1v1 Pro Tournament (4-Color)',
  blokus_duo: 'Blokus Duo (14×14)',
  pass_play: '4P Pass & Play',
  puzzle: 'Endgame Puzzles',
};

export function getClockTimings(preset: ClockPreset): { initialMs: number; incrementMs: number } | null {
  if (preset === 'blitz_3m') return { initialMs: 180_000, incrementMs: 3_000 };
  if (preset === 'rapid_5m') return { initialMs: 300_000, incrementMs: 5_000 };
  return null;
}

export function getAlliedColorIds(mode: GameMode, colorId: number): readonly number[] {
  if (mode === 'tournament_1v1') {
    return colorId % 2 === 0 ? [0, 2] : [1, 3];
  }
  return [colorId];
}

export function buildInitialBoardAndPlayers(config: MatchSetupConfig): {
  board: BoardState;
  players: ColorPlayerState[];
} {
  const fullHand = PIECES.map((p) => p.id);

  if (config.mode === 'puzzle') {
    const puzzle = PUZZLE_BY_ID[config.puzzleId ?? ''] ?? PUZZLES[0];
    const board = createBoardState({
      size: puzzle.boardSize,
      colorCount: 1,
      startAnchors: [puzzle.startAnchor],
      mustCoverStart: puzzle.mustCoverStart,
      initialCells: puzzle.initialCells,
    });
    const prePlaced = puzzle.initialCells.filter((c) => c === 0).length;
    const players: ColorPlayerState[] = [
      {
        id: 0,
        name: 'Challenger',
        controllerName: 'Challenger',
        controllerId: 0,
        color: PLAYER_COLORS[0],
        isHuman: true,
        aiAutoplay: false,
        available: [...puzzle.availablePieces],
        placedSquares: prePlaced,
        placedPieces: 0,
        lastPiece: null,
        passed: false,
      },
    ];
    return { board, players };
  }

  if (config.mode === 'blokus_duo') {
    const board = createDuoBoard();
    const vsHuman = config.opponentType === 'human';
    const players: ColorPlayerState[] = [
      {
        id: 0,
        name: vsHuman ? 'Player 1' : 'You',
        controllerName: vsHuman ? 'Player 1' : 'You',
        controllerId: 0,
        color: PLAYER_COLORS[0],
        isHuman: true,
        aiAutoplay: false,
        available: [...fullHand],
        placedSquares: 0,
        placedPieces: 0,
        lastPiece: null,
        passed: false,
      },
      {
        id: 1,
        name: vsHuman ? 'Player 2' : 'Duel AI',
        controllerName: vsHuman ? 'Player 2' : 'Duel AI',
        controllerId: 1,
        color: PLAYER_COLORS[2], // High-contrast Coral vs Blue for 14x14 Duo
        isHuman: vsHuman,
        aiAutoplay: false,
        available: [...fullHand],
        placedSquares: 0,
        placedPieces: 0,
        lastPiece: null,
        passed: false,
      },
    ];
    return { board, players };
  }

  const board = createClassicBoard();

  if (config.mode === 'tournament_1v1') {
    const vsHuman = config.opponentType === 'human';
    const players: ColorPlayerState[] = PLAYER_COLORS.map((color, id) => {
      const isTeamA = id === 0 || id === 2;
      const controllerName = isTeamA
        ? (vsHuman ? 'Player 1' : 'You')
        : (vsHuman ? 'Player 2' : 'Grandmaster AI');
      return {
        id,
        name: `${PLAYER_NAMES[id]} (${isTeamA ? 'P1' : vsHuman ? 'P2' : 'AI'})`,
        controllerName,
        controllerId: isTeamA ? 0 : 1,
        color,
        isHuman: isTeamA ? true : vsHuman,
        aiAutoplay: false,
        available: [...fullHand],
        placedSquares: 0,
        placedPieces: 0,
        lastPiece: null,
        passed: false,
      };
    });
    return { board, players };
  }

  const soloNames = ['You', 'Nova AI', 'Echo AI', 'Moss AI'];
  const duoCoopNames = ['Player 1', 'Nova AI', 'Player 2', 'Moss AI'];

  const players: ColorPlayerState[] = PLAYER_COLORS.map((color, id) => {
    const isHuman =
      config.mode === 'pass_play'
        ? true
        : config.mode === 'duo_coop'
          ? id === 0 || id === 2
          : id === 0;
    const name =
      config.mode === 'solo'
        ? soloNames[id]
        : config.mode === 'duo_coop'
          ? duoCoopNames[id]
          : PLAYER_NAMES[id];
    return {
      id,
      name,
      controllerName: name,
      controllerId: id,
      color,
      isHuman,
      aiAutoplay: false,
      available: [...fullHand],
      placedSquares: 0,
      placedPieces: 0,
      lastPiece: null,
      passed: false,
    };
  });

  return { board, players };
}

export function prepareTurnSelection(
  board: BoardState,
  player: ColorPlayerState | undefined,
  sizeFilter: PieceSize | null = null,
): {
  selectedPiece: string | null;
  rotation: number;
  flipped: boolean;
  cursor: Point;
} {
  const fallbackAnchor = board.startAnchors[player?.id ?? 0] ?? { x: 0, y: 0 };
  if (!player || player.available.length === 0) {
    return { selectedPiece: null, rotation: 0, flipped: false, cursor: fallbackAnchor };
  }

  const availSet = new Set(player.available);
  // Prefer larger pieces first when auto-selecting so players don't accidentally play 1-square 'M' on turn 1
  const orderedIds = PIECES_BY_SIZE_DESC
    .filter((p) => availSet.has(p.id) && (sizeFilter === null || p.size === sizeFilter))
    .map((p) => p.id);
  const pool = orderedIds.length > 0 ? orderedIds : player.available;

  for (const pieceId of pool) {
    const moves = findLegalMovesForPieceOnBoard(board, player.id, pieceId);
    if (moves.length > 0) {
      const move = moves[0];
      const shape = getShape(pieceId, move.rotation, move.flipped);
      return {
        selectedPiece: pieceId,
        rotation: move.rotation,
        flipped: move.flipped,
        cursor: getPointFromAnchor(shape, { x: move.x, y: move.y }, board.size),
      };
    }
  }

  const fallbackPiece = pool[0];
  const shape = getShape(fallbackPiece, 0, false);
  return {
    selectedPiece: fallbackPiece,
    rotation: 0,
    flipped: false,
    cursor: getPointFromAnchor(shape, getAnchorFromPoint(shape, fallbackAnchor, board.size), board.size),
  };
}

export function reconstructBoardAtIndex(
  config: MatchSetupConfig,
  history: readonly MatchActionEntry[],
  targetIndex: number,
  previousPlayers?: readonly ColorPlayerState[],
): {
  board: BoardState;
  players: ColorPlayerState[];
  turn: number;
  movesPlayed: number;
  lastMove: LastPlacementInfo | null;
} {
  const { board: initBoard, players: initPlayers } = buildInitialBoardAndPlayers(config);
  let board = initBoard;
  const players = initPlayers.map((p, idx) => ({
    ...p,
    aiAutoplay: previousPlayers?.[idx]?.aiAutoplay ?? p.aiAutoplay,
  }));

  const clamped = Math.max(0, Math.min(history.length, targetIndex));
  let movesPlayed = 0;
  let lastMove: LastPlacementInfo | null = null;
  let turn = 0;

  for (let i = 0; i < clamped; i += 1) {
    const entry = history[i];
    const p = players[entry.colorId];
    if (!p) continue;
    if (entry.kind === 'pass') {
      players[entry.colorId] = { ...p, passed: true };
    } else {
      const { move } = entry;
      const shape = getShape(move.pieceId, move.rotation, move.flipped);
      const started = hasColorStarted(board, entry.colorId);
      board = applyPlacementToBoard(board, entry.colorId, shape, { x: move.x, y: move.y }, started);
      const placedCells = shape.map((c) => ({ x: move.x + c.x, y: move.y + c.y }));
      players[entry.colorId] = {
        ...p,
        available: p.available.filter((id) => id !== move.pieceId),
        placedSquares: p.placedSquares + shape.length,
        placedPieces: p.placedPieces + 1,
        lastPiece: move.pieceId,
        passed: false,
      };
      movesPlayed += 1;
      lastMove = {
        serial: i + 1,
        colorId: entry.colorId,
        pieceId: move.pieceId,
        cells: placedCells,
      };
    }
    turn = (entry.colorId + 1) % players.length;
  }

  // Advance past any colors that lack legal moves if still mid-game
  for (let probe = 0; probe < players.length; probe += 1) {
    const cand = (turn + probe) % players.length;
    if (!players[cand].passed && findAnyLegalMoveOnBoard(board, cand, players[cand].available)) {
      turn = cand;
      break;
    }
  }

  return { board, players, turn, movesPlayed, lastMove };
}
