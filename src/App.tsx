import { memo, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { CSSProperties, Dispatch } from 'react';
import {
  BOARD_SIZE,
  PIECES,
  PIECE_BY_ID,
  PLAYER_COLORS,
  PLAYER_NAMES,
  START_CORNERS,
  findAnyLegalMove,
  findBestMove,
  findLegalMovesForPiece,
  getAnchorFromPoint,
  getPointFromAnchor,
  getShape,
  hasLegalMoveForPiece,
  validatePlacement,
} from './game';
import type { Move, Point } from './game';

type Mode = 'solo' | 'duo' | 'local';
type Phase = 'start' | 'playing' | 'paused' | 'gameover';

type PlayerState = {
  id: number;
  name: string;
  color: string;
  isHuman: boolean;
  available: string[];
  placedSquares: number;
  placedPieces: number;
  lastPiece: string | null;
  passed: boolean;
};

type LastMove = {
  id: number;
  playerId: number;
  pieceId: string;
  cells: Point[];
};

type GameState = {
  phase: Phase;
  mode: Mode;
  sessionId: number;
  board: number[];
  players: PlayerState[];
  turn: number;
  selectedPiece: string | null;
  rotation: number;
  flipped: boolean;
  cursor: Point;
  hover: Point | null;
  movesPlayed: number;
  consecutivePasses: number;
  handoff: boolean;
  skippedNotice: string | null;
  message: string;
  lastMove: LastMove | null;
  errorSerial: number;
};

type ScoreRecord = {
  score: number;
  result: 'WIN' | 'RUN';
  mode: Mode;
  date: string;
};

type Action =
  | { type: 'START'; mode: Mode }
  | { type: 'RESTART' }
  | { type: 'MENU' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'READY' }
  | { type: 'SELECT'; pieceId: string }
  | { type: 'ROTATE' }
  | { type: 'FLIP' }
  | { type: 'MOVE_CURSOR'; dx: number; dy: number }
  | { type: 'POINTER'; point: Point | null }
  | { type: 'PLACE'; point: Point; isTouch?: boolean }
  | { type: 'AI_PLACE'; playerId: number; sessionId: number; move: Move }
  | { type: 'SKIP'; playerId: number; sessionId: number };

const emptyMenuState: GameState = {
  phase: 'start',
  mode: 'solo',
  sessionId: 0,
  board: [],
  players: [],
  turn: 0,
  selectedPiece: null,
  rotation: 0,
  flipped: false,
  cursor: { x: 0, y: 0 },
  hover: null,
  movesPlayed: 0,
  consecutivePasses: 0,
  handoff: false,
  skippedNotice: null,
  message: '',
  lastMove: null,
  errorSerial: 0,
};

function prepareTurnSelection(board: number[], player: PlayerState | undefined): {
  selectedPiece: string | null;
  rotation: number;
  flipped: boolean;
  cursor: Point;
} {
  const fallbackCorner = START_CORNERS[player?.id ?? 0] ?? { x: 0, y: 0 };
  if (!player || player.available.length === 0) {
    return { selectedPiece: null, rotation: 0, flipped: false, cursor: fallbackCorner };
  }
  const hasStarted = player.placedSquares > 0;
  for (const pieceId of player.available) {
    const move = findLegalMovesForPiece(board, player.id, pieceId, hasStarted)[0];
    if (move) {
      const shape = getShape(pieceId, move.rotation, move.flipped);
      return {
        selectedPiece: pieceId,
        rotation: move.rotation,
        flipped: move.flipped,
        cursor: getPointFromAnchor(shape, { x: move.x, y: move.y }),
      };
    }
  }
  const firstPiece = player.available[0];
  const shape = getShape(firstPiece, 0, false);
  return {
    selectedPiece: firstPiece,
    rotation: 0,
    flipped: false,
    cursor: getPointFromAnchor(shape, getAnchorFromPoint(shape, fallbackCorner)),
  };
}

function makeGame(mode: Mode): GameState {
  const soloNames = ['You', 'Nova', 'Echo', 'Moss'];
  const duoNames = ['Player 1', 'Nova', 'Player 2', 'Moss'];
  const players: PlayerState[] = PLAYER_COLORS.map((color, id) => ({
    id,
    name: mode === 'solo' ? soloNames[id] : mode === 'duo' ? duoNames[id] : PLAYER_NAMES[id],
    color,
    isHuman: mode === 'local' ? true : mode === 'duo' ? (id === 0 || id === 2) : id === 0,
    available: PIECES.map((piece) => piece.id),
    placedSquares: 0,
    placedPieces: 0,
    lastPiece: null,
    passed: false,
  }));
  const board = Array(BOARD_SIZE * BOARD_SIZE).fill(-1);
  const initialSelection = prepareTurnSelection(board, players[0]);

  return {
    ...emptyMenuState,
    phase: 'playing',
    mode,
    sessionId: Date.now() + Math.floor(Math.random() * 1000),
    board,
    players,
    ...initialSelection,
    message: mode === 'duo'
      ? 'Player 1 starts on the top-left blue corner.'
      : 'Your first piece must cover the blue corner.',
  };
}

function canControlTurn(state: GameState): boolean {
  const current = state.players[state.turn];
  return state.phase === 'playing' && !state.handoff && !!current?.isHuman;
}

function finishPlacement(state: GameState, playerId: number, move: Move, fromCpu: boolean): GameState {
  if (playerId !== state.turn || state.phase !== 'playing') return state;
  const player = state.players[playerId];
  if (!player || !player.available.includes(move.pieceId)) return state;
  if (fromCpu && player.isHuman) return state;
  if (!fromCpu && !canControlTurn(state)) return state;

  const shape = getShape(move.pieceId, move.rotation, move.flipped);
  const anchor = { x: move.x, y: move.y };
  const placement = validatePlacement(state.board, playerId, shape, anchor, player.placedSquares > 0);
  if (!placement.valid) {
    return {
      ...state,
      message: placement.reason ?? 'That piece cannot be placed there.',
      errorSerial: state.errorSerial + 1,
    };
  }

  const board = state.board.slice();
  const placedCells = shape.map((cell) => ({ x: anchor.x + cell.x, y: anchor.y + cell.y }));
  for (const cell of placedCells) board[cell.y * BOARD_SIZE + cell.x] = playerId;

  const players = state.players.map((entry) => entry.id === playerId
    ? {
      ...entry,
      available: entry.available.filter((pieceId) => pieceId !== move.pieceId),
      placedSquares: entry.placedSquares + shape.length,
      placedPieces: entry.placedPieces + 1,
      lastPiece: move.pieceId,
      passed: false,
    }
    : entry);
  const pieceLabel = PIECE_BY_ID[move.pieceId]?.label ?? move.pieceId;
  const nextMoveCount = state.movesPlayed + 1;
  const nextTurn = (playerId + 1) % 4;
  const nextPlayer = players[nextTurn];
  const nextSelection = nextPlayer?.isHuman
    ? prepareTurnSelection(board, nextPlayer)
    : { selectedPiece: null, rotation: 0, flipped: false, cursor: state.cursor };

  return {
    ...state,
    board,
    players,
    turn: nextTurn,
    ...nextSelection,
    hover: null,
    movesPlayed: nextMoveCount,
    consecutivePasses: 0,
    handoff: state.mode === 'local',
    skippedNotice: null,
    message: `${player.name} placed ${pieceLabel} · ${shape.length} ${shape.length === 1 ? 'square' : 'squares'}`,
    lastMove: { id: nextMoveCount, playerId, pieceId: move.pieceId, cells: placedCells },
  };
}

function gameReducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'START':
      return makeGame(action.mode);
    case 'RESTART':
      return state.phase === 'start' ? state : makeGame(state.mode);
    case 'MENU':
      return emptyMenuState;
    case 'PAUSE':
      return state.phase === 'playing' ? { ...state, phase: 'paused' } : state;
    case 'RESUME':
      return state.phase === 'paused' ? { ...state, phase: 'playing' } : state;
    case 'READY': {
      if (state.phase !== 'playing' || state.mode !== 'local' || !state.handoff) return state;
      const currentPlayer = state.players[state.turn];
      const selection = state.selectedPiece
        ? { selectedPiece: state.selectedPiece, rotation: state.rotation, flipped: state.flipped, cursor: state.cursor }
        : prepareTurnSelection(state.board, currentPlayer);
      const nextMessage = state.skippedNotice
        ? `${state.skippedNotice} passed. ${currentPlayer?.name ?? 'Player'} is up.`
        : `${currentPlayer?.name ?? 'Player'} is up.`;
      return {
        ...state,
        ...selection,
        handoff: false,
        skippedNotice: null,
        message: nextMessage,
      };
    }
    case 'SELECT': {
      if (!canControlTurn(state)) return state;
      const player = state.players[state.turn];
      if (!player?.available.includes(action.pieceId)) return state;
      const suggested = findLegalMovesForPiece(state.board, player.id, action.pieceId, player.placedSquares > 0)[0];
      const rotation = suggested?.rotation ?? 0;
      const flipped = suggested?.flipped ?? false;
      const shape = getShape(action.pieceId, rotation, flipped);
      const cursor = suggested
        ? getPointFromAnchor(shape, { x: suggested.x, y: suggested.y })
        : getPointFromAnchor(shape, getAnchorFromPoint(shape, state.cursor));
      return {
        ...state,
        selectedPiece: action.pieceId,
        rotation,
        flipped,
        cursor,
        hover: null,
        message: suggested ? 'Piece selected. Place it, or adjust its shape.' : 'No legal placement for this piece right now.',
      };
    }
    case 'ROTATE': {
      if (!canControlTurn(state) || !state.selectedPiece) return state;
      const rotation = (state.rotation + 1) % 4;
      const nextShape = getShape(state.selectedPiece, rotation, state.flipped);
      const basePoint = state.hover ?? state.cursor;
      const cursor = getPointFromAnchor(nextShape, getAnchorFromPoint(nextShape, basePoint));
      return { ...state, rotation, cursor, hover: null, message: 'Rotated 90°.' };
    }
    case 'FLIP': {
      if (!canControlTurn(state) || !state.selectedPiece) return state;
      const flipped = !state.flipped;
      const nextShape = getShape(state.selectedPiece, state.rotation, flipped);
      const basePoint = state.hover ?? state.cursor;
      const cursor = getPointFromAnchor(nextShape, getAnchorFromPoint(nextShape, basePoint));
      return { ...state, flipped, cursor, hover: null, message: 'Piece mirrored.' };
    }
    case 'MOVE_CURSOR': {
      if (!canControlTurn(state)) return state;
      const basePoint = state.hover ?? state.cursor;
      if (!state.selectedPiece) {
        return {
          ...state,
          cursor: {
            x: Math.max(0, Math.min(BOARD_SIZE - 1, basePoint.x + action.dx)),
            y: Math.max(0, Math.min(BOARD_SIZE - 1, basePoint.y + action.dy)),
          },
          hover: null,
        };
      }
      const shape = getShape(state.selectedPiece, state.rotation, state.flipped);
      const currentAnchor = getAnchorFromPoint(shape, basePoint);
      const handlePoint = getPointFromAnchor(shape, currentAnchor);
      const nextAnchor = getAnchorFromPoint(shape, {
        x: handlePoint.x + action.dx,
        y: handlePoint.y + action.dy,
      });
      return {
        ...state,
        cursor: getPointFromAnchor(shape, nextAnchor),
        hover: null,
      };
    }
    case 'POINTER':
      return canControlTurn(state) && state.selectedPiece
        ? { ...state, hover: action.point }
        : state;
    case 'PLACE': {
      if (!canControlTurn(state) || !state.selectedPiece) return state;
      const player = state.players[state.turn];
      if (!player) return state;
      const shape = getShape(state.selectedPiece, state.rotation, state.flipped);
      const targetAnchor = getAnchorFromPoint(shape, action.point);
      const targetCursor = getPointFromAnchor(shape, targetAnchor);
      const currentAnchor = getAnchorFromPoint(shape, state.hover ?? state.cursor);
      const placement = validatePlacement(state.board, player.id, shape, targetAnchor, player.placedSquares > 0);

      if (action.isTouch && (targetAnchor.x !== currentAnchor.x || targetAnchor.y !== currentAnchor.y)) {
        return {
          ...state,
          cursor: targetCursor,
          hover: null,
          message: placement.valid
            ? 'Preview moved. Tap again to place.'
            : (placement.reason ?? 'That piece cannot be placed there.'),
          errorSerial: placement.valid ? state.errorSerial : state.errorSerial + 1,
        };
      }

      const nextState = finishPlacement(state, state.turn, {
        pieceId: state.selectedPiece,
        x: targetAnchor.x,
        y: targetAnchor.y,
        rotation: state.rotation,
        flipped: state.flipped,
      }, false);

      if (nextState.movesPlayed === state.movesPlayed) {
        return {
          ...nextState,
          cursor: targetCursor,
          hover: action.isTouch ? null : state.hover,
        };
      }
      return nextState;
    }
    case 'AI_PLACE':
      if (state.sessionId !== action.sessionId || state.turn !== action.playerId) return state;
      return finishPlacement(state, action.playerId, action.move, true);
    case 'SKIP': {
      if (state.sessionId !== action.sessionId || state.phase !== 'playing' || state.turn !== action.playerId) return state;
      const consecutivePasses = state.consecutivePasses + 1;
      if (consecutivePasses >= 4) {
        return {
          ...state,
          phase: 'gameover',
          selectedPiece: null,
          handoff: false,
          skippedNotice: null,
          consecutivePasses,
          message: 'No legal moves remain.',
        };
      }
      const player = state.players[action.playerId];
      const nextPlayers = state.players.map((entry) => entry.id === action.playerId ? { ...entry, passed: true } : entry);
      const nextTurn = (action.playerId + 1) % 4;
      const nextPlayer = nextPlayers[nextTurn];
      const nextSelection = nextPlayer?.isHuman
        ? prepareTurnSelection(state.board, nextPlayer)
        : { selectedPiece: null, rotation: 0, flipped: false, cursor: state.cursor };
      const skippedPlayerName = player?.name ?? 'Player';
      const skippedNotice = state.skippedNotice ? `${state.skippedNotice}, ${skippedPlayerName}` : skippedPlayerName;
      return {
        ...state,
        players: nextPlayers,
        turn: nextTurn,
        ...nextSelection,
        hover: null,
        handoff: state.mode === 'local',
        skippedNotice,
        consecutivePasses,
        message: `${skippedNotice} ${skippedNotice.includes(',') ? 'have' : 'has'} no legal moves — passing turn.`,
      };
    }
    default:
      return state;
  }
}

function scoreFor(player: PlayerState): number {
  const clearBonus = player.available.length === 0 ? 15 + (player.lastPiece === 'M' ? 5 : 0) : 0;
  return player.placedSquares + clearBonus;
}

function loadRecords(): ScoreRecord[] {
  try {
    const saved = window.localStorage.getItem('blokus-local-scores');
    if (!saved) return [];
    const parsed = JSON.parse(saved) as ScoreRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => typeof entry?.score === 'number' && (entry.mode === 'solo' || entry.mode === 'duo' || entry.mode === 'local'))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  } catch {
    return [];
  }
}

function saveRecord(record: ScoreRecord, records: ScoreRecord[]): ScoreRecord[] {
  const next = [...records, record].sort((a, b) => b.score - a.score).slice(0, 5);
  try {
    window.localStorage.setItem('blokus-local-scores', JSON.stringify(next));
  } catch {
    // The game remains playable when browser storage is unavailable.
  }
  return next;
}

const heroShapes = [
  { x: 1, y: 2, color: PLAYER_COLORS[0], cells: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]] },
  { x: 5, y: 1, color: PLAYER_COLORS[0], cells: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]] },
  { x: 15, y: 2, color: PLAYER_COLORS[1], cells: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]] },
  { x: 17, y: 6, color: PLAYER_COLORS[1], cells: [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]] },
  { x: 15, y: 15, color: PLAYER_COLORS[2], cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]] },
  { x: 1, y: 15, color: PLAYER_COLORS[3], cells: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]] },
  { x: 4, y: 17, color: PLAYER_COLORS[3], cells: [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]] },
];

function HeroBackdrop() {
  const tiles = useMemo(() => {
    const colors = new Map<string, string>();
    for (const shape of heroShapes) {
      for (const [x, y] of shape.cells) colors.set(`${shape.x + x},${shape.y + y}`, shape.color);
    }
    return Array.from({ length: 400 }, (_, index) => {
      const x = index % 20;
      const y = Math.floor(index / 20);
      return { index, color: colors.get(`${x},${y}`) };
    });
  }, []);

  return (
    <div className="hero-art" aria-hidden="true">
      <div className="hero-grid">
        {tiles.map((tile) => (
          <span
            key={tile.index}
            className={tile.color ? 'hero-grid-cell hero-grid-cell--filled' : 'hero-grid-cell'}
            style={tile.color ? { '--hero-tile': tile.color } as CSSProperties : undefined}
          />
        ))}
      </div>
      <div className="hero-vignette" />
    </div>
  );
}

function Mark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? 'brand-mark brand-mark--compact' : 'brand-mark'} aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  );
}

function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={small ? 'brand brand--small' : 'brand'}>
      <Mark compact={small} />
      <span>BLOKUS</span>
    </div>
  );
}

function ChevronIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M10 4l6 6-6 6" /></svg>;
}

function RotateIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.8-3L3 11" /><path d="M3 5v6h6M4 13a8 8 0 0 0 14.8 3L21 13" /><path d="M21 19v-6h-6" /></svg>;
}

function FlipIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M5 7h4v10H5zM15 7h4v10h-4z" /></svg>;
}

function PauseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>;
}

function RestartIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4.8 10a7.5 7.5 0 0 1 12.9-3L20 12M4 17v-5h5M19.2 14a7.5 7.5 0 0 1-12.9 3L4 12" /></svg>;
}

function HighScoreTable({ records }: { records: ScoreRecord[] }) {
  return (
    <div className="high-score-table">
      <div className="high-score-head">
        <span>RANK</span>
        <span>RESULT</span>
        <span>SCORE</span>
        <span>MODE</span>
      </div>
      {records.length === 0 ? (
        <p className="empty-scores">Your first finished match will be recorded here.</p>
      ) : records.map((record, index) => (
        <div className="high-score-row" key={`${record.date}-${record.score}-${index}`}>
          <span className="high-score-rank">{String(index + 1).padStart(2, '0')}</span>
          <span className={record.result === 'WIN' ? 'record-win' : ''}>{record.result}</span>
          <strong>{record.score}</strong>
          <span>{record.mode === 'solo' ? 'SOLO' : record.mode === 'duo' ? '2P + AI' : 'LOCAL'}</span>
        </div>
      ))}
    </div>
  );
}

function StartScreen({
  mode,
  onMode,
  onStart,
  records,
}: {
  mode: Mode;
  onMode: (mode: Mode) => void;
  onStart: () => void;
  records: ScoreRecord[];
}) {
  return (
    <div className="start-screen">
      <section className="start-hero">
        <HeroBackdrop />
        <header className="start-header">
          <Brand />
          <span className="start-edition">THE CORNER-CLAIMING GAME</span>
        </header>
        <main className="start-copy">
          <p className="eyebrow"><span className="eyebrow-line" /> FOUR PLAYERS. ONE BOARD.</p>
          <h1>BLOKUS<span className="title-period">.</span></h1>
          <p className="start-description">Claim new territory. Connect by corners.<br />Never share an edge.</p>
          <div className="start-controls">
            <div className="mode-picker" aria-label="Choose game mode">
              <button className={mode === 'solo' ? 'mode-option is-selected' : 'mode-option'} onClick={() => onMode('solo')} aria-pressed={mode === 'solo'}>
                <span className="mode-indicator" /> SOLO <small>1P + 3 AI</small>
              </button>
              <button className={mode === 'duo' ? 'mode-option is-selected' : 'mode-option'} onClick={() => onMode('duo')} aria-pressed={mode === 'duo'}>
                <span className="mode-indicator" /> 2 PLAYERS <small>2P + 2 AI</small>
              </button>
              <button className={mode === 'local' ? 'mode-option is-selected' : 'mode-option'} onClick={() => onMode('local')} aria-pressed={mode === 'local'}>
                <span className="mode-indicator" /> PASS & PLAY <small>4 PLAYERS</small>
              </button>
            </div>
            <button className="start-button" onClick={onStart}>
              <span>TAKE YOUR CORNER</span><ChevronIcon />
            </button>
          </div>
          <div className="hero-rule"><span>01</span> Your first piece starts on your corner.</div>
        </main>
        <div className="hero-scroll" aria-hidden="true"><span /> STRATEGY, SQUARE BY SQUARE</div>
      </section>

      <section className="records-section">
        <div className="records-intro">
          <p className="eyebrow">LOCAL SCOREBOARD</p>
          <h2>Make your mark.</h2>
          <p>Top runs are saved on this device.</p>
        </div>
        <HighScoreTable records={records} />
      </section>
    </div>
  );
}

function PieceButton({
  pieceId,
  available,
  playable,
  selected,
  rotation,
  flipped,
  color,
  disabled,
  onClick,
}: {
  pieceId: string;
  available: boolean;
  playable: boolean;
  selected: boolean;
  rotation: number;
  flipped: boolean;
  color: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const piece = PIECE_BY_ID[pieceId];
  const shape = selected ? getShape(pieceId, rotation, flipped) : piece.cells;
  const cells = new Set(shape.map((cell) => `${cell.x},${cell.y}`));
  const classes = [
    'piece-button',
    selected ? 'is-selected' : '',
    !available ? 'is-used' : '',
    available && !playable ? 'is-blocked' : '',
  ].filter(Boolean).join(' ');
  const statusSuffix = !available ? ', used' : !playable ? ', no legal placement' : '';
  return (
    <button
      className={classes}
      style={{ '--piece-color': color } as CSSProperties}
      onClick={onClick}
      disabled={disabled || !available}
      aria-pressed={selected}
      aria-label={`Select ${piece.label}, ${piece.cells.length} squares${statusSuffix}`}
      title={`${piece.label} · ${piece.cells.length} ${piece.cells.length === 1 ? 'square' : 'squares'}${available && !playable ? ' (no legal placement)' : ''}`}
    >
      <span className="piece-thumb" aria-hidden="true">
        {Array.from({ length: 25 }, (_, index) => {
          const x = index % 5;
          const y = Math.floor(index / 5);
          return <i key={index} className={cells.has(`${x},${y}`) ? 'mini-cell is-filled' : 'mini-cell'} />;
        })}
      </span>
      <span className="piece-label">{piece.label}</span>
    </button>
  );
}

function PlayerRailView({ game }: { game: GameState }) {
  const current = game.players[game.turn];
  return (
    <aside className="player-rail">
      <div className="rail-heading">
        <span className="section-kicker">THE TABLE</span>
        <span className="player-count">04 / 04</span>
      </div>
      <div className="player-list">
        {game.players.map((player) => {
          const active = player.id === game.turn && game.phase === 'playing';
          const finalScore = scoreFor(player);
          return (
            <div className={`player-row${active ? ' is-active' : ''}${player.passed ? ' has-passed' : ''}`} key={player.id}>
              <span className="player-swatch" style={{ '--player-color': player.color } as CSSProperties} />
              <span className="player-details">
                <strong>
                  {player.name}
                  {player.isHuman && game.mode === 'solo' ? <small> YOU</small> : null}
                  {player.isHuman && game.mode === 'duo' ? <small> {player.id === 0 ? 'P1' : 'P2'}</small> : null}
                  {!player.isHuman ? <small> AI</small> : null}
                </strong>
                <small>{player.available.length} PIECES LEFT</small>
              </span>
              <span className="player-score">{game.phase === 'gameover' ? finalScore : player.placedSquares}</span>
            </div>
          );
        })}
      </div>
      <div className="rail-rule">
        <span className="rule-mark">↘</span>
        <p>Your color may touch itself only at the corners. Block the rest.</p>
      </div>
      <div className="move-count"><span>MOVES PLAYED</span><strong>{String(game.movesPlayed).padStart(2, '0')}</strong></div>
      {current ? <span className="sr-only">{current.name} to move</span> : null}
    </aside>
  );
}

const PlayerRail = memo(PlayerRailView, (previous, next) => (
  previous.game.players === next.game.players &&
  previous.game.turn === next.game.turn &&
  previous.game.phase === next.game.phase &&
  previous.game.mode === next.game.mode &&
  previous.game.movesPlayed === next.game.movesPlayed
));

type BurstParticle = { tx: number; ty: number; delay: number; size: number; rotate: number };

function Board({
  game,
  onPointer,
  onPlace,
  burst,
}: {
  game: GameState;
  onPointer: (point: Point | null) => void;
  onPlace: (point: Point, isTouch?: boolean) => void;
  burst: { id: number; x: number; y: number; color: string; particles: BurstParticle[] } | null;
}) {
  const lastPointerType = useRef<string>('mouse');
  const player = game.players[game.turn];
  const canPlay = canControlTurn(game) && !!player && !!game.selectedPiece;
  const shape = canPlay ? getShape(game.selectedPiece!, game.rotation, game.flipped) : [];
  const activePoint = game.hover ?? game.cursor;
  const anchor = canPlay ? getAnchorFromPoint(shape, activePoint) : activePoint;
  const handlePoint = canPlay ? getPointFromAnchor(shape, anchor) : game.cursor;
  const placement = canPlay && player
    ? validatePlacement(game.board, player.id, shape, anchor, player.placedSquares > 0)
    : { valid: false };
  const preview = new Map<number, boolean>();
  if (canPlay) {
    for (const cell of shape) {
      const x = anchor.x + cell.x;
      const y = anchor.y + cell.y;
      if (x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE) {
        preview.set(y * BOARD_SIZE + x, placement.valid);
      }
    }
  }

  const lastMoveCells = useMemo(() => new Set(game.lastMove?.cells.map((cell) => cell.y * BOARD_SIZE + cell.x) ?? []), [game.lastMove]);
  const cells = useMemo(() => Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => index), []);

  return (
    <section className="board-stage" aria-label="Game board">
      <div className="board-caption">
        <span><i className="caption-dot" style={{ '--player-color': player?.color ?? '#fff' } as CSSProperties} />
          {player ? (!player.isHuman ? `${player.name.toUpperCase()} IS THINKING` : `${player.name.toUpperCase()} TO MOVE`) : 'MATCH BOARD'}
        </span>
        <span>20 × 20</span>
      </div>
      <div className="board-frame">
        <div
          className="board-grid"
          style={{ '--active-color': player?.color ?? '#ffffff' } as CSSProperties}
          onPointerLeave={(event) => { if (event.pointerType !== 'touch') onPointer(null); }}
        >
          {cells.map((index) => {
            const x = index % BOARD_SIZE;
            const y = Math.floor(index / BOARD_SIZE);
            const owner = game.board[index];
            const cornerOwner = START_CORNERS.findIndex((corner) => corner.x === x && corner.y === y);
            const previewState = preview.get(index);
            const classes = [
              'board-cell',
              owner >= 0 ? 'is-owned' : '',
              owner >= 0 && lastMoveCells.has(index) ? 'is-new' : '',
              previewState !== undefined ? (previewState ? 'is-preview' : 'is-invalid-preview') : '',
              owner === -1 && cornerOwner >= 0 ? 'is-start-corner' : '',
              game.hover === null && canPlay && handlePoint.x === x && handlePoint.y === y ? 'is-keyboard-cursor' : '',
            ].filter(Boolean).join(' ');

            return (
              <button
                key={index}
                className={classes}
                style={{
                  ...(owner >= 0 ? { '--tile-color': game.players[owner]?.color } : {}),
                  ...(cornerOwner >= 0 ? { '--corner-color': PLAYER_COLORS[cornerOwner] } : {}),
                } as CSSProperties}
                aria-label={`Row ${y + 1}, column ${x + 1}${owner >= 0 ? `, ${game.players[owner]?.name}` : ', empty'}`}
                tabIndex={-1}
                onPointerDown={(event) => { lastPointerType.current = event.pointerType; }}
                onPointerEnter={(event) => { if (event.pointerType !== 'touch') onPointer({ x, y }); }}
                onClick={() => onPlace({ x, y }, lastPointerType.current === 'touch')}
              />
            );
          })}
          {burst ? (
            <div className="particle-layer" key={burst.id} aria-hidden="true">
              {burst.particles.map((particle, index) => (
                <i
                  className="burst-particle"
                  key={index}
                  style={{
                    left: `${burst.x}%`,
                    top: `${burst.y}%`,
                    backgroundColor: burst.color,
                    width: `${particle.size}px`,
                    height: `${particle.size}px`,
                    animationDelay: `${particle.delay}ms`,
                    '--particle-x': `${particle.tx}px`,
                    '--particle-y': `${particle.ty}px`,
                    '--particle-rotate': `${particle.rotate}deg`,
                  } as CSSProperties}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="board-footer">
        <span><kbd>R</kbd> ROTATE <kbd>F</kbd> MIRROR</span>
        <span><kbd>ENTER</kbd> PLACE</span>
      </div>
      {!placement.valid && canPlay ? <span className="sr-only">{placement.reason}</span> : null}
    </section>
  );
}

function PiecePanelView({ game, dispatch }: { game: GameState; dispatch: Dispatch<Action> }) {
  const player = game.players[game.turn];
  const userTurn = canControlTurn(game) && !!player;
  const selected = game.selectedPiece ? PIECE_BY_ID[game.selectedPiece] : null;
  const remaining = player?.available.length ?? 0;
  const playablePieces = useMemo(() => {
    if (!userTurn || !player) return new Set<string>();
    const hasStarted = player.placedSquares > 0;
    const set = new Set<string>();
    for (const pieceId of player.available) {
      if (hasLegalMoveForPiece(game.board, player.id, pieceId, hasStarted)) {
        set.add(pieceId);
      }
    }
    return set;
  }, [userTurn, game.board, player]);

  return (
    <aside className="piece-panel">
      <div className="pieces-heading">
        <div>
          <span className="section-kicker">YOUR HAND</span>
          <h2>{userTurn ? (selected ? selected.label : 'Choose a piece') : !player?.isHuman ? 'Rivals move' : 'Next player'}</h2>
        </div>
        <span className="pieces-remaining">{String(remaining).padStart(2, '0')}<small> / 21</small></span>
      </div>
      <div className="piece-tools">
        <button className="tool-button" onClick={() => dispatch({ type: 'ROTATE' })} disabled={!userTurn || !selected} title="Rotate piece (R)">
          <RotateIcon /><span>ROTATE</span><kbd>R</kbd>
        </button>
        <button className="tool-button" onClick={() => dispatch({ type: 'FLIP' })} disabled={!userTurn || !selected} title="Mirror piece (F)">
          <FlipIcon /><span>MIRROR</span><kbd>F</kbd>
        </button>
      </div>
      {userTurn ? (
        <div className="pieces-grid" aria-label="Available pieces">
          {PIECES.map((piece) => (
            <PieceButton
              key={piece.id}
              pieceId={piece.id}
              available={player.available.includes(piece.id)}
              playable={playablePieces.has(piece.id)}
              selected={game.selectedPiece === piece.id}
              rotation={game.selectedPiece === piece.id ? game.rotation : 0}
              flipped={game.selectedPiece === piece.id ? game.flipped : false}
              color={player.color}
              disabled={!userTurn}
              onClick={() => dispatch({ type: 'SELECT', pieceId: piece.id })}
            />
          ))}
        </div>
      ) : (
        <div className="rival-thinking">
          <span className="thinking-orbit" style={{ '--player-color': player?.color ?? '#fff' } as CSSProperties}><i /><i /><i /></span>
          <p>{player?.name ?? 'The next player'} is finding a way through.</p>
        </div>
      )}
      <div className="piece-help">
        <span className="help-glyph">+</span>
        <p>{userTurn ? 'Select a piece, then tap a board square to set its corner.' : 'Rivals are placing their next shape.'}</p>
      </div>
    </aside>
  );
}

const PiecePanel = memo(PiecePanelView, (previous, next) => (
  previous.dispatch === next.dispatch &&
  previous.game.players === next.game.players &&
  previous.game.board === next.game.board &&
  previous.game.turn === next.game.turn &&
  previous.game.phase === next.game.phase &&
  previous.game.mode === next.game.mode &&
  previous.game.handoff === next.game.handoff &&
  previous.game.selectedPiece === next.game.selectedPiece &&
  previous.game.rotation === next.game.rotation &&
  previous.game.flipped === next.game.flipped
));

function getBurst(move: LastMove, color: string): { id: number; x: number; y: number; color: string; particles: BurstParticle[] } {
  const xs = move.cells.map((cell) => cell.x);
  const ys = move.cells.map((cell) => cell.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const particles = Array.from({ length: 15 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 15 + Math.random() * 0.24;
    const distance = 24 + Math.random() * 58;
    return {
      tx: Math.cos(angle) * distance,
      ty: Math.sin(angle) * distance,
      delay: Math.floor(Math.random() * 70),
      size: 3 + Math.random() * 4,
      rotate: Math.floor(Math.random() * 170),
    };
  });
  return {
    id: move.id,
    x: ((minX + maxX + 1) / 2 / BOARD_SIZE) * 100,
    y: ((minY + maxY + 1) / 2 / BOARD_SIZE) * 100,
    color,
    particles,
  };
}

function getFinalStandings(players: PlayerState[]): (PlayerState & { finalScore: number })[] {
  return players
    .map((player) => ({ ...player, finalScore: scoreFor(player) }))
    .sort((a, b) => b.finalScore - a.finalScore || b.placedSquares - a.placedSquares);
}

function GameOverlay({
  game,
  records,
  dispatch,
}: {
  game: GameState;
  records: ScoreRecord[];
  dispatch: Dispatch<Action>;
}) {
  if (game.phase === 'paused') {
    return (
      <div className="game-overlay">
        <div className="pause-dialog">
          <Mark />
          <p className="eyebrow">MATCH ON HOLD</p>
          <h2>Take a breath.</h2>
          <p className="overlay-copy">Your pieces are right where you left them.</p>
          <button className="start-button overlay-primary" onClick={() => dispatch({ type: 'RESUME' })}>
            <span>RESUME MATCH</span><ChevronIcon />
          </button>
          <div className="overlay-actions">
            <button onClick={() => dispatch({ type: 'RESTART' })}>START OVER</button>
            <button onClick={() => dispatch({ type: 'MENU' })}>MAIN MENU</button>
          </div>
        </div>
      </div>
    );
  }

  if (game.phase === 'gameover') {
    const standings = getFinalStandings(game.players);
    const topScore = standings[0]?.finalScore ?? 0;
    const winners = standings.filter((player) => player.finalScore === topScore);
    const isTie = winners.length > 1;
    const winner = winners[0];
    return (
      <div className="game-overlay game-overlay--results">
        <div className="results-dialog">
          <div className="results-heading">
            <p className="eyebrow">NO MORE MOVES</p>
            <h2>{isTie ? 'Shared territory.' : 'Territory claimed.'}</h2>
            <p>
              {isTie
                ? `Tie game — ${winners.map((entry) => entry.name).join(' & ')} share the board with ${topScore} points.`
                : `${winner?.name ?? 'The winner'} takes the board with ${winner?.finalScore ?? 0} points.`}
            </p>
          </div>
          <div className="results-content">
            <div className="standings-block">
              <span className="section-kicker">FINAL STANDINGS</span>
              <div className="standings-list">
                {standings.map((player, index) => {
                  const isTop = player.finalScore === topScore;
                  const rank = isTop ? 1 : index + 1;
                  return (
                    <div className={`standing-row${isTop ? ' is-winner' : ''}`} key={player.id}>
                      <span className="standing-rank">{String(rank).padStart(2, '0')}</span>
                      <i style={{ '--player-color': player.color } as CSSProperties} />
                      <strong>{player.name}{isTop ? <small> {isTie ? 'TIED 1ST' : 'WINNER'}</small> : null}</strong>
                      <span className="standing-pieces">{player.placedSquares} TILES</span>
                      <b>{player.finalScore}</b>
                    </div>
                  );
                })}
              </div>
              <p className="score-note">Scores count placed squares. Clearing all 21 pieces earns a 15-point bonus; finishing on the single earns 5 more.</p>
              <div className="results-actions">
                <button className="start-button" onClick={() => dispatch({ type: 'RESTART' })}>
                  <span>PLAY AGAIN</span><ChevronIcon />
                </button>
                <button className="text-action" onClick={() => dispatch({ type: 'MENU' })}>MAIN MENU</button>
              </div>
            </div>
            <div className="results-records">
              <span className="section-kicker">LOCAL HIGH SCORES</span>
              <HighScoreTable records={records} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (game.phase === 'playing' && game.mode === 'local' && game.handoff) {
    const player = game.players[game.turn];
    return (
      <div className="game-overlay game-overlay--handoff">
        <div className="handoff-dialog">
          <span className="handoff-swatch" style={{ '--player-color': player?.color ?? '#fff' } as CSSProperties} />
          <p className="eyebrow">PASS THE BOARD</p>
          <h2>Pass to <span style={{ color: player?.color }}>{player?.name}</span>.</h2>
          {game.skippedNotice ? (
            <p className="handoff-skip-note">
              {game.skippedNotice} {game.skippedNotice.includes(',') ? 'had' : 'had'} no legal moves and passed.
            </p>
          ) : null}
          <p className="overlay-copy">Ready to claim a corner?</p>
          <button className="start-button overlay-primary" onClick={() => dispatch({ type: 'READY' })}>
            <span>{player?.name.toUpperCase()} IS READY</span><ChevronIcon />
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function GameScreen({
  game,
  dispatch,
  records,
  shaking,
  burst,
}: {
  game: GameState;
  dispatch: Dispatch<Action>;
  records: ScoreRecord[];
  shaking: boolean;
  burst: ReturnType<typeof getBurst> | null;
}) {
  const current = game.players[game.turn];
  return (
    <div className={`game-screen${shaking ? ' is-shaking' : ''}`}>
      <header className="game-header">
        <Brand small />
        <div className="header-turn" style={{ '--player-color': current?.color ?? '#fff' } as CSSProperties}>
          <span className="turn-light" />
          <span>{current?.name ?? 'PLAYER'}{current?.isHuman && game.mode !== 'local' ? ' · YOUR MOVE' : ' · TURN'}</span>
        </div>
        <div className="header-actions">
          <span className="mode-tag">{game.mode === 'solo' ? 'SOLO' : game.mode === 'duo' ? '2P + 2 AI' : 'PASS & PLAY'}</span>
          <button className="icon-button" onClick={() => dispatch({ type: 'RESTART' })} aria-label="Restart match" title="Instant restart">
            <RestartIcon /><span>RESTART</span>
          </button>
          <button className="icon-button pause-button" onClick={() => dispatch({ type: 'PAUSE' })} aria-label="Pause match" title="Pause (Esc)">
            <PauseIcon /><span>PAUSE</span>
          </button>
        </div>
      </header>
      <main className="game-layout">
        <PlayerRail game={game} />
        <Board
          game={game}
          onPointer={(point) => dispatch({ type: 'POINTER', point })}
          onPlace={(point, isTouch) => dispatch({ type: 'PLACE', point, isTouch })}
          burst={burst}
        />
        <PiecePanel game={game} dispatch={dispatch} />
      </main>
      <div className="game-message" key={`${game.message}-${game.errorSerial}`} aria-live="polite">
        <span className="message-mark" />{game.message}
      </div>
      <GameOverlay game={game} records={records} dispatch={dispatch} />
    </div>
  );
}

export default function App() {
  const [game, dispatch] = useReducer(gameReducer, emptyMenuState);
  const [menuMode, setMenuMode] = useState<Mode>('solo');
  const [records, setRecords] = useState<ScoreRecord[]>(loadRecords);
  const [shaking, setShaking] = useState(false);
  const [burst, setBurst] = useState<ReturnType<typeof getBurst> | null>(null);
  const lastMoveId = useRef('');
  const savedSessionId = useRef(0);
  const gameRef = useRef(game);
  gameRef.current = game;

  useEffect(() => {
    if (game.phase !== 'playing') return;
    const player = game.players[game.turn];
    if (!player) return;

    const bestMove = !player.isHuman
      ? findBestMove(game.board, player.id, player.available, player.placedSquares > 0)
      : findAnyLegalMove(game.board, player.id, player.available, player.placedSquares > 0);

    if (!bestMove) {
      const playerId = game.turn;
      const sessionId = game.sessionId;
      if (!player.isHuman) {
        const timer = window.setTimeout(() => {
          dispatch({ type: 'SKIP', playerId, sessionId });
        }, 260);
        return () => window.clearTimeout(timer);
      }
      dispatch({ type: 'SKIP', playerId, sessionId });
      return;
    }

    if (!player.isHuman) {
      const playerId = game.turn;
      const sessionId = game.sessionId;
      const timer = window.setTimeout(() => {
        dispatch({ type: 'AI_PLACE', playerId, sessionId, move: bestMove });
      }, 440);
      return () => window.clearTimeout(timer);
    }
  }, [game.phase, game.turn, game.movesPlayed, game.sessionId, game.mode, game.handoff, game.players, game.board]);

  useEffect(() => {
    if (!game.lastMove) {
      lastMoveId.current = '';
      setBurst(null);
      setShaking(false);
      return;
    }
    const moveKey = `${game.sessionId}:${game.lastMove.id}`;
    if (moveKey === lastMoveId.current) return;
    lastMoveId.current = moveKey;
    const color = game.players[game.lastMove.playerId]?.color ?? '#ffffff';
    setBurst(getBurst(game.lastMove, color));
    setShaking(true);
    const timer = window.setTimeout(() => setShaking(false), 230);
    const burstTimer = window.setTimeout(() => setBurst(null), 720);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(burstTimer);
    };
  }, [game.sessionId, game.lastMove]);

  useEffect(() => {
    if (game.phase !== 'gameover' || savedSessionId.current === game.sessionId) return;
    savedSessionId.current = game.sessionId;
    const standings = getFinalStandings(game.players);
    const topScore = standings[0]?.finalScore ?? 0;
    const humanScores = game.players.filter((entry) => entry.isHuman).map((entry) => scoreFor(entry));
    const bestHumanScore = humanScores.length > 0 ? Math.max(...humanScores) : 0;
    const record: ScoreRecord = game.mode === 'local'
      ? {
        score: topScore,
        result: 'WIN',
        mode: game.mode,
        date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      }
      : {
        score: bestHumanScore,
        result: bestHumanScore >= topScore ? 'WIN' : 'RUN',
        mode: game.mode,
        date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      };
    setRecords((current) => saveRecord(record, current));
  }, [game.phase, game.sessionId, game.players, game.mode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;
      const currentGame = gameRef.current;

      if (event.key === 'Escape') {
        if (currentGame.phase === 'playing') dispatch({ type: 'PAUSE' });
        else if (currentGame.phase === 'paused') dispatch({ type: 'RESUME' });
        return;
      }
      if (currentGame.phase !== 'playing' || !canControlTurn(currentGame)) return;

      const key = event.key.toLowerCase();
      if (key === 'r') {
        event.preventDefault();
        dispatch({ type: 'ROTATE' });
      } else if (key === 'f') {
        event.preventDefault();
        dispatch({ type: 'FLIP' });
      } else if (['arrowup', 'w'].includes(key)) {
        event.preventDefault();
        dispatch({ type: 'MOVE_CURSOR', dx: 0, dy: -1 });
      } else if (['arrowdown', 's'].includes(key)) {
        event.preventDefault();
        dispatch({ type: 'MOVE_CURSOR', dx: 0, dy: 1 });
      } else if (['arrowleft', 'a'].includes(key)) {
        event.preventDefault();
        dispatch({ type: 'MOVE_CURSOR', dx: -1, dy: 0 });
      } else if (['arrowright', 'd'].includes(key)) {
        event.preventDefault();
        dispatch({ type: 'MOVE_CURSOR', dx: 1, dy: 0 });
      } else if (key === 'enter' || key === ' ') {
        if (target?.closest('button')) return;
        event.preventDefault();
        dispatch({ type: 'PLACE', point: currentGame.hover ?? currentGame.cursor });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (game.phase === 'start') {
    return (
      <StartScreen
        mode={menuMode}
        onMode={setMenuMode}
        onStart={() => dispatch({ type: 'START', mode: menuMode })}
        records={records}
      />
    );
  }

  return <GameScreen game={game} dispatch={dispatch} records={records} shaking={shaking} burst={burst} />;
}