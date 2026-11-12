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
import {
  buildAcrylicCellStyle,
  buildGhostSilhouetteStyle,
  getShapeNeighborMask,
} from './AcrylicPieceCell.tsx';
import type { NeighborMask } from './AcrylicPieceCell.tsx';
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

const CORNER_AURA_STYLE: readonly CSSProperties[] = [
  { top: -38, left: -38 },
  { top: -38, right: -38 },
  { bottom: -38, right: -38 },
  { bottom: -38, left: -38 },
];

const CORNER_COUNTER_SPECS: readonly { style: CSSProperties; align: 'left' | 'right' }[] = [
  { style: { right: 'calc(100% + 14px)', top: 2 }, align: 'right' },
  { style: { left: 'calc(100% + 14px)', top: 2 }, align: 'left' },
  { style: { left: 'calc(100% + 14px)', bottom: 2 }, align: 'left' },
  { style: { right: 'calc(100% + 14px)', bottom: 2 }, align: 'right' },
];

function getAnchorClipTriangle(pt: Point, size: number): string {
  if (pt.x === 0 && pt.y === 0) return 'polygon(0 0, 100% 0, 0 100%)';
  if (pt.x === size - 1 && pt.y === 0) return 'polygon(0 0, 100% 0, 100% 100%)';
  if (pt.x === size - 1 && pt.y === size - 1) return 'polygon(100% 0, 100% 100%, 0 100%)';
  if (pt.x === 0 && pt.y === size - 1) return 'polygon(0 0, 100% 100%, 0 100%)';
  // Inner anchor (e.g. Blokus Duo 14x14 (4,4) & (9,9)): subtle recessed diamond
  return 'polygon(50% 12%, 88% 50%, 50% 88%, 12% 50%)';
}

/**
 * Layer 1: Molded Physical Board Base with Raised Cross-Rib Slots & Engraved Start Triangles.
 * Always sits underneath translucent placed pieces so cross-ribs subtly refract through them!
 */
const MoldedSlotBase = memo(function MoldedSlotBase({
  size,
  cells,
  startAnchors,
  mustCoverStart,
  playerColors,
}: {
  readonly size: number;
  readonly cells: readonly number[];
  readonly startAnchors: readonly Point[];
  readonly mustCoverStart: boolean;
  readonly playerColors: readonly string[];
}) {
  const startInfoByIdx = useMemo(() => {
    const map = new Map<number, { color: string; clip: string }>();
    if (!mustCoverStart) return map;
    startAnchors.forEach((pt, cid) => {
      if (pt.x >= 0 && pt.y >= 0 && pt.x < size && pt.y < size) {
        map.set(pt.y * size + pt.x, {
          color: playerColors[cid] ?? PLAYER_COLORS[cid] ?? '#fff',
          clip: getAnchorClipTriangle(pt, size),
        });
      }
    });
    return map;
  }, [mustCoverStart, playerColors, size, startAnchors]);

  return (
    <div
      className="grid h-full w-full overflow-hidden rounded-[4px]"
      style={{
        gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${size}, minmax(0, 1fr))`,
      }}
    >
      {cells.map((owner, idx) => {
        if (owner === OBSTACLE_CELL) {
          return (
            <div
              key={idx}
              style={{
                background: 'var(--board-obstacle)',
                boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.08), inset -1px -1px 0 rgba(0,0,0,0.45)',
              }}
            />
          );
        }
        const anchor = startInfoByIdx.get(idx);
        return (
          <div key={idx} className="board-slot relative">
            {anchor && owner < 0 && (
              <span
                className="pointer-events-none absolute inset-[22%] opacity-42"
                style={{
                  backgroundColor: anchor.color,
                  clipPath: anchor.clip,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
});

/**
 * Layer 2: Unclipped Monolithic Acrylic Pieces Layer (overflow: visible so corner bevels,
 * 3D bottom-right wall shadows, and victory waves are NEVER sliced off!).
 */
const CommittedAcrylicLayer = memo(function CommittedAcrylicLayer({
  size,
  cells,
  playerColors,
  lastMoveKeySet,
  isGameOver,
  winnerColorIds,
}: {
  readonly size: number;
  readonly cells: readonly number[];
  readonly playerColors: readonly string[];
  readonly lastMoveKeySet: ReadonlySet<number>;
  readonly isGameOver: boolean;
  readonly winnerColorIds: ReadonlySet<number>;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 grid"
      style={{
        gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${size}, minmax(0, 1fr))`,
      }}
    >
      {cells.map((owner, idx) => {
        if (owner < 0) return null;
        const x = idx % size;
        const y = (idx - x) / size;
        const mask: NeighborMask = {
          top: y > 0 && cells[(y - 1) * size + x] === owner,
          right: x < size - 1 && cells[y * size + (x + 1)] === owner,
          bottom: y < size - 1 && cells[(y + 1) * size + x] === owner,
          left: x > 0 && cells[y * size + (x - 1)] === owner,
        };
        const tileColor = playerColors[owner] ?? PLAYER_COLORS[owner] ?? '#1684ff';
        const isLast = lastMoveKeySet.has(idx);
        const isVictory = isGameOver && winnerColorIds.has(owner);

        const baseStyle = buildAcrylicCellStyle(tileColor, mask, 3, true);

        return (
          <div
            key={idx}
            className={`poly-cell ${isLast ? 'animate-tile-land' : ''} ${
              isVictory ? 'animate-victory-wave' : ''
            }`}
            style={{
              ...baseStyle,
              gridColumnStart: x + 1,
              gridRowStart: y + 1,
              animationDelay: isVictory ? `${(x + y) * 24}ms` : undefined,
            }}
          >
            <span className="poly-facet" />
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
  const wellRef = useRef<HTMLDivElement | null>(null);
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
      const el = wellRef.current;
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

  const ghostOccupied = useMemo(() => {
    const set = new Set<string>();
    if (!ghost) return set;
    for (const c of ghost.shape) {
      set.add(`${ghost.anchor.x + c.x},${ghost.anchor.y + c.y}`);
    }
    return set;
  }, [ghost]);

  const activeColor = players[turn]?.color ?? PLAYER_COLORS[0];
  const getCornerSlotIndex = (playerIdx: number): number => {
    if (players.length === 2) return playerIdx === 0 ? 0 : 2;
    return playerIdx % 4;
  };

  return (
    <div
      className="relative flex items-center justify-center transition-transform duration-700"
      style={{
        transform: isGameOver ? 'translate3d(0, -10px, 0) scale3d(0.94, 0.94, 1)' : 'translate3d(0, 0, 0)',
        transitionTimingFunction: 'var(--ease-spring)',
      }}
    >
      {/* Active Turn Ambient Corner Breathing Aura (Unclipped!) */}
      {!isGameOver && players[turn] && (
        <div
          className="pointer-events-none absolute h-36 w-36 rounded-full animate-corner-breathe transition-all duration-500"
          style={{
            ...CORNER_AURA_STYLE[getCornerSlotIndex(turn)],
            background: `radial-gradient(circle, ${activeColor}48 0%, ${activeColor}18 42%, transparent 72%)`,
          }}
        />
      )}

      {/* Strictly Symmetric Four-Corner Remaining Square Counters */}
      {players.map((p) => {
        const slotIdx = getCornerSlotIndex(p.id);
        const spec = CORNER_COUNTER_SPECS[slotIdx];
        const remaining = countRemainingSquares(p.available);
        return (
          <div key={p.id} className="pointer-events-none absolute z-20" style={spec.style}>
            <RollingNumber
              value={remaining}
              align={spec.align}
              active={!isGameOver && p.id === turn}
              winner={isGameOver && winnerColorIds.has(p.id)}
              accentColor={p.color}
            />
          </div>
        );
      })}

      {/* Outer Physical Concentric Board Bezel (R=14px, Padding=10px, NO overflow-hidden!) */}
      <div
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
        }}
        className={`board-bezel relative aspect-square touch-none ${
          canHumanAct && isPiecePickedUp ? 'cursor-none' : 'cursor-default'
        }`}
      >
        {/* Inner Recessed 20×20 Grid Well (R_inner = 4px = 14px - 10px) */}
        <div
          ref={wellRef}
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
          className="board-well relative h-full w-full"
        >
          <MoldedSlotBase
            size={board.size}
            cells={board.cells}
            startAnchors={board.startAnchors}
            mustCoverStart={board.mustCoverStart}
            playerColors={playerColors}
          />

          <CommittedAcrylicLayer
            size={board.size}
            cells={board.cells}
            playerColors={playerColors}
            lastMoveKeySet={lastMoveKeySet}
            isGameOver={isGameOver}
            winnerColorIds={winnerColorIds}
          />

          {/* Layer 3: Connected Silhouette Ghost Preview on Exact CSS Grid Tracks (Zero Sub-Pixel Drift!) */}
          {ghost && (
            <div
              className="pointer-events-none absolute inset-0 z-20 grid"
              style={{
                gridTemplateColumns: `repeat(${board.size}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${board.size}, minmax(0, 1fr))`,
              }}
            >
              {ghost.shape.map((cell, i) => {
                const gx = ghost.anchor.x + cell.x;
                const gy = ghost.anchor.y + cell.y;
                if (gx < 0 || gy < 0 || gx >= board.size || gy >= board.size) return null;
                const mask = getShapeNeighborMask(ghostOccupied, gx, gy);
                return (
                  <div
                    key={i}
                    style={{
                      ...buildGhostSilhouetteStyle(activeColor, mask, ghost.validation.valid),
                      gridColumnStart: gx + 1,
                      gridRowStart: gy + 1,
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
