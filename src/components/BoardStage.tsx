import { memo, useCallback, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  OBSTACLE_CELL,
  PLAYER_COLORS,
  countRemainingSquares,
  hasColorStarted,
  resolveGhostPlacement,
} from '../engine/index.ts';
import type { BoardState, ColorPlayerState, Point } from '../engine/index.ts';
import type { LastPlacementInfo } from '../state/matchTypes.ts';
import { RollingNumber } from './RollingNumber.tsx';

type BoardStageProps = {
  readonly board: BoardState;
  readonly players: readonly ColorPlayerState[];
  readonly turn: number;
  readonly isGameOver: boolean;
  readonly winnerColorIds: ReadonlySet<number>;
  readonly canHumanAct: boolean;
  readonly isPiecePickedUp: boolean;
  readonly selectedPiece: string | null;
  readonly rotation: number;
  readonly flipped: boolean;
  readonly externalDragPoint: Point | null;
  readonly lastMove: LastPlacementInfo | null;
  readonly onPlaceAtPointer: (pointer: Point) => void;
  readonly onRotate: (delta: 1 | -1) => void;
  readonly onFlip: () => void;
};

const CORNER_POSITIONS_4P = [
  '-top-7 -left-7',
  '-top-7 -right-7',
  '-bottom-7 -right-7',
  '-bottom-7 -left-7',
] as const;

const CORNER_AURA_POS_4P = [
  '-top-12 -left-12',
  '-top-12 -right-12',
  '-bottom-12 -right-12',
  '-bottom-12 -left-12',
] as const;

const CommittedBoardGrid = memo(function CommittedBoardGrid({
  size,
  cells,
  startAnchors,
  mustCoverStart,
  playerColors,
  lastMoveKeySet,
  isGameOver,
  winnerColorIds,
}: {
  readonly size: number;
  readonly cells: readonly number[];
  readonly startAnchors: readonly Point[];
  readonly mustCoverStart: boolean;
  readonly playerColors: readonly string[];
  readonly lastMoveKeySet: ReadonlySet<number>;
  readonly isGameOver: boolean;
  readonly winnerColorIds: ReadonlySet<number>;
}) {
  const startOwnerByIdx = useMemo(() => {
    const map = new Map<number, number>();
    if (!mustCoverStart) return map;
    startAnchors.forEach((pt, cid) => {
      if (pt.x >= 0 && pt.y >= 0 && pt.x < size && pt.y < size) {
        map.set(pt.y * size + pt.x, cid);
      }
    });
    return map;
  }, [mustCoverStart, size, startAnchors]);

  return (
    <div
      className="grid h-full w-full p-[2px]"
      style={{
        gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${size}, minmax(0, 1fr))`,
      }}
    >
      {cells.map((owner, idx) => {
        const x = idx % size;
        const y = (idx - x) / size;

        if (owner === OBSTACLE_CELL) {
          return (
            <div
              key={idx}
              className="m-[0.5px] rounded-[2px]"
              style={{ background: 'var(--board-obstacle)' }}
            />
          );
        }

        if (owner >= 0) {
          const tileColor = playerColors[owner] ?? PLAYER_COLORS[owner] ?? '#38a8ff';
          const isLast = lastMoveKeySet.has(idx);
          const isVictoryWave = isGameOver && winnerColorIds.has(owner);

          return (
            <div
              key={idx}
              className={`acrylic-tile m-[0.75px] rounded-[2.5px] ${
                isLast ? 'animate-tile-land' : ''
              } ${isVictoryWave ? 'animate-victory-wave' : ''}`}
              style={
                {
                  '--tile-color': tileColor,
                  animationDelay: isVictoryWave ? `${(x + y) * 26}ms` : undefined,
                } as CSSProperties
              }
            />
          );
        }

        const startOwner = startOwnerByIdx.get(idx);
        return (
          <div
            key={idx}
            className="relative m-[0.5px] rounded-[1.5px]"
            style={{
              background: 'var(--board-cell)',
              boxShadow: 'inset 0 0 0 0.5px var(--board-groove)',
            }}
          >
            {startOwner !== undefined && (
              <span
                className="pointer-events-none absolute inset-[36%] rounded-full opacity-55"
                style={{
                  backgroundColor: playerColors[startOwner] ?? PLAYER_COLORS[startOwner] ?? '#fff',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
});

export function BoardStage({
  board,
  players,
  turn,
  isGameOver,
  winnerColorIds,
  canHumanAct,
  isPiecePickedUp,
  selectedPiece,
  rotation,
  flipped,
  externalDragPoint,
  lastMove,
  onPlaceAtPointer,
  onRotate,
  onFlip,
}: BoardStageProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);

  const playerColors = useMemo(() => players.map((p) => p.color), [players]);
  const lastMoveKeySet = useMemo(() => {
    const s = new Set<number>();
    if (lastMove) {
      for (const c of lastMove.cells) s.add(c.y * board.size + c.x);
    }
    return s;
  }, [board.size, lastMove]);

  const clientCoordsToCell = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const el = stageRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (
        clientX < rect.left ||
        clientY < rect.top ||
        clientX > rect.right ||
        clientY > rect.bottom
      ) {
        return null;
      }
      return {
        x: Math.min(
          board.size - 1,
          Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * board.size)),
        ),
        y: Math.min(
          board.size - 1,
          Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * board.size)),
        ),
      };
    },
    [board.size],
  );

  const activePointer = externalDragPoint ?? hoverPoint;
  const started = useMemo(() => hasColorStarted(board, turn), [board, turn]);

  const ghost = useMemo(() => {
    if (!canHumanAct || !isPiecePickedUp || !selectedPiece || !activePointer) return null;
    return resolveGhostPlacement(
      board,
      turn,
      selectedPiece,
      rotation,
      flipped,
      activePointer,
      started,
      2,
    );
  }, [activePointer, board, canHumanAct, flipped, isPiecePickedUp, rotation, selectedPiece, started, turn]);

  const activeColor = players[turn]?.color ?? PLAYER_COLORS[0];
  const getCornerSlotIndex = (playerIdx: number): number => {
    if (players.length === 2) return playerIdx === 0 ? 0 : 2;
    return playerIdx % 4;
  };

  return (
    <div
      className="relative flex items-center justify-center transition-transform duration-700"
      style={{
        transform: isGameOver ? 'translate3d(0, -12px, 0) scale(0.94)' : 'translate3d(0, 0, 0) scale(1)',
        transitionTimingFunction: 'var(--ease-spring)',
      }}
    >
      {/* Active Turn Ambient Corner Breathing Glow (Zero Text!) */}
      {!isGameOver && players[turn] && (
        <div
          className={`pointer-events-none absolute h-36 w-36 rounded-full blur-2xl animate-corner-breathe transition-all duration-500 ${
            CORNER_AURA_POS_4P[getCornerSlotIndex(turn)]
          }`}
          style={{
            background: `radial-gradient(circle, ${activeColor}55 0%, transparent 72%)`,
          }}
        />
      )}

      {/* Four Outer Corner Suspended Remaining-Square Counters */}
      {players.map((p) => {
        const slotIdx = getCornerSlotIndex(p.id);
        const remaining = countRemainingSquares(p.available);
        return (
          <div
            key={p.id}
            className={`pointer-events-none absolute z-20 ${CORNER_POSITIONS_4P[slotIdx]}`}
          >
            <RollingNumber
              value={remaining}
              active={!isGameOver && p.id === turn}
              winner={isGameOver && winnerColorIds.has(p.id)}
              accentColor={p.color}
            />
          </div>
        );
      })}

      {/* Main Sculptural Recessed Board */}
      <div
        ref={stageRef}
        data-board-stage="true"
        data-board-size={board.size}
        onPointerMove={(e) => {
          const pt = clientCoordsToCell(e.clientX, e.clientY);
          setHoverPoint((prev) => (prev?.x === pt?.x && prev?.y === pt?.y ? prev : pt));
        }}
        onPointerLeave={() => setHoverPoint(null)}
        onPointerDown={(e) => {
          if (e.button === 2) return;
          if (!canHumanAct || !isPiecePickedUp || !selectedPiece) return;
          const pt = clientCoordsToCell(e.clientX, e.clientY);
          if (pt) onPlaceAtPointer(pt);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (canHumanAct && isPiecePickedUp) onFlip();
        }}
        onWheel={(e) => {
          if (!canHumanAct || !isPiecePickedUp || !selectedPiece) return;
          if (Math.abs(e.deltaY) > 3) {
            onRotate(e.deltaY > 0 ? 1 : -1);
          }
        }}
        style={{
          width: 'min(64vmin, 540px)',
          height: 'min(64vmin, 540px)',
          background: 'var(--board-surface)',
          boxShadow: 'var(--board-shadow)',
        }}
        className={`relative aspect-square overflow-hidden rounded-2xl touch-none ${
          canHumanAct && isPiecePickedUp ? 'cursor-none' : 'cursor-default'
        }`}
      >
        <CommittedBoardGrid
          size={board.size}
          cells={board.cells}
          startAnchors={board.startAnchors}
          mustCoverStart={board.mustCoverStart}
          playerColors={playerColors}
          lastMoveKeySet={lastMoveKeySet}
          isGameOver={isGameOver}
          winnerColorIds={winnerColorIds}
        />

        {/* Soft Magnetic Ghost Projection (Zero Error Popups!) */}
        {ghost && (
          <div className="pointer-events-none absolute inset-0 z-10 p-[2px]">
            {ghost.shape.map((cell, i) => {
              const gx = ghost.anchor.x + cell.x;
              const gy = ghost.anchor.y + cell.y;
              if (gx < 0 || gy < 0 || gx >= board.size || gy >= board.size) return null;
              const valid = ghost.validation.valid;
              return (
                <div
                  key={i}
                  className="absolute rounded-[2.5px] transition-all duration-100"
                  style={{
                    left: `${(gx / board.size) * 100}%`,
                    top: `${(gy / board.size) * 100}%`,
                    width: `${100 / board.size}%`,
                    height: `${100 / board.size}%`,
                    backgroundColor: valid ? `${activeColor}8c` : `${activeColor}26`,
                    boxShadow: valid
                      ? `inset 0 0 0 1.2px rgba(255,255,255,0.78), 0 0 12px ${activeColor}66`
                      : 'inset 0 0 0 1px rgba(255, 84, 104, 0.58)',
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
