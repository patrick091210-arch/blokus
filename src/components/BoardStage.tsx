import { memo, useCallback, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  CONTESTED_TERRITORY,
  EMPTY_CELL,
  OBSTACLE_CELL,
  PLAYER_COLORS,
  computeTerritoryMap,
  getCornerHints,
  hasColorStarted,
  resolveGhostPlacement,
} from '../engine/index.ts';
import type { BoardState, ColorPlayerState, Point } from '../engine/index.ts';
import type { LastPlacementInfo } from '../state/matchTypes.ts';

type BoardStageProps = {
  readonly board: BoardState;
  readonly players: readonly ColorPlayerState[];
  readonly turn: number;
  readonly canHumanAct: boolean;
  readonly selectedPiece: string | null;
  readonly rotation: number;
  readonly flipped: boolean;
  readonly cursor: Point;
  readonly externalDragPoint: Point | null;
  readonly lastMove: LastPlacementInfo | null;
  readonly colorblindMode: boolean;
  readonly showCornerHints: boolean;
  readonly showTerritoryOverlay: boolean;
  readonly snapToCorner: boolean;
  readonly onPlaceAtPointer: (pointer: Point, isTouch: boolean) => void;
  readonly onRotate: (delta: 1 | -1) => void;
  readonly onFlip: () => void;
};

type CommittedGridProps = {
  readonly size: number;
  readonly cells: readonly number[];
  readonly startAnchors: readonly Point[];
  readonly mustCoverStart: boolean;
  readonly playerColors: readonly string[];
  readonly lastMoveKeySet: ReadonlySet<number>;
  readonly colorblindMode: boolean;
};

const CommittedBoardGrid = memo(function CommittedBoardGrid({
  size,
  cells,
  startAnchors,
  mustCoverStart,
  playerColors,
  lastMoveKeySet,
  colorblindMode,
}: CommittedGridProps) {
  const startOwnerByIdx = useMemo(() => {
    const map = new Map<number, number>();
    if (!mustCoverStart) return map;
    startAnchors.forEach((pt, colorId) => {
      if (pt.x >= 0 && pt.y >= 0 && pt.x < size && pt.y < size) {
        map.set(pt.y * size + pt.x, colorId);
      }
    });
    return map;
  }, [mustCoverStart, size, startAnchors]);

  return (
    <div
      className="grid h-full w-full"
      style={{
        gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${size}, minmax(0, 1fr))`,
      }}
    >
      {cells.map((owner, idx) => {
        const startOwner = startOwnerByIdx.get(idx);
        const isLast = lastMoveKeySet.has(idx);
        if (owner === OBSTACLE_CELL) {
          return (
            <div
              key={idx}
              className="border border-white/[0.06] bg-slate-800/90 shadow-inner"
              title="Blocked cell"
            />
          );
        }
        if (owner >= 0) {
          const tileColor = playerColors[owner] ?? PLAYER_COLORS[owner] ?? '#42b6ff';
          return (
            <div
              key={idx}
              className={`board-tile border border-black/30 ${
                colorblindMode ? `cb-pattern-${owner % 4}` : ''
              } ${isLast ? 'ring-1 ring-white/80 z-[2]' : ''}`}
              style={{ '--tile-color': tileColor } as CSSProperties}
            />
          );
        }
        return (
          <div key={idx} className="relative border border-white/[0.06] bg-[#141f26]/80">
            {startOwner !== undefined && (
              <span
                className="pointer-events-none absolute inset-[26%] rounded-full opacity-80 ring-2"
                style={{
                  backgroundColor: `${playerColors[startOwner] ?? '#fff'}33`,
                  borderColor: playerColors[startOwner] ?? '#fff',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
});

const TacticalOverlay = memo(function TacticalOverlay({
  board,
  turn,
  playerColors,
  showCornerHints,
  showTerritoryOverlay,
  canHumanAct,
}: {
  readonly board: BoardState;
  readonly turn: number;
  readonly playerColors: readonly string[];
  readonly showCornerHints: boolean;
  readonly showTerritoryOverlay: boolean;
  readonly canHumanAct: boolean;
}) {
  const territory = useMemo(
    () => (showTerritoryOverlay ? computeTerritoryMap(board) : null),
    [board, showTerritoryOverlay],
  );
  const cornerHints = useMemo(
    () => (showCornerHints && canHumanAct ? getCornerHints(board, turn) : []),
    [board, canHumanAct, showCornerHints, turn],
  );

  if (!territory && cornerHints.length === 0) return null;

  const { size } = board;
  const activeColor = playerColors[turn] ?? '#42b6ff';

  return (
    <div className="pointer-events-none absolute inset-0 z-[3]">
      {territory && (
        <div
          className="grid h-full w-full"
          style={{
            gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${size}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: size * size }, (_, idx) => {
            if (board.cells[idx] !== EMPTY_CELL) return <div key={idx} />;
            const owner = territory.ownerByCell[idx];
            if (owner === CONTESTED_TERRITORY) {
              return <div key={idx} className="bg-white/[0.09]" />;
            }
            if (owner >= 0) {
              const dist = territory.distanceByCell[idx];
              const alpha = Math.max(0.08, 0.32 - (dist - 1) * 0.035);
              return (
                <div
                  key={idx}
                  style={{
                    backgroundColor: playerColors[owner] ?? '#fff',
                    opacity: alpha,
                  }}
                />
              );
            }
            return <div key={idx} />;
          })}
        </div>
      )}

      {cornerHints.map((pt) => (
        <div
          key={`${pt.x},${pt.y}`}
          className="absolute flex items-center justify-center"
          style={{
            left: `${(pt.x / size) * 100}%`,
            top: `${(pt.y / size) * 100}%`,
            width: `${100 / size}%`,
            height: `${100 / size}%`,
          }}
        >
          <span
            className="h-2 w-2 rotate-45 rounded-[1px] shadow-sm animate-pulse"
            style={{
              backgroundColor: activeColor,
              boxShadow: `0 0 8px ${activeColor}`,
            }}
          />
        </div>
      ))}
    </div>
  );
});

export function BoardStage({
  board,
  players,
  turn,
  canHumanAct,
  selectedPiece,
  rotation,
  flipped,
  cursor,
  externalDragPoint,
  lastMove,
  colorblindMode,
  showCornerHints,
  showTerritoryOverlay,
  snapToCorner,
  onPlaceAtPointer,
  onRotate,
  onFlip,
}: BoardStageProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);

  const playerColors = useMemo(() => players.map((p) => p.color), [players]);
  const lastMoveKeySet = useMemo(() => {
    const set = new Set<number>();
    if (lastMove) {
      for (const c of lastMove.cells) {
        set.add(c.y * board.size + c.x);
      }
    }
    return set;
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
      const x = Math.min(
        board.size - 1,
        Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * board.size)),
      );
      const y = Math.min(
        board.size - 1,
        Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * board.size)),
      );
      return { x, y };
    },
    [board.size],
  );

  const activePointer = externalDragPoint ?? hoverPoint ?? cursor;
  const started = useMemo(() => hasColorStarted(board, turn), [board, turn]);

  const ghost = useMemo(() => {
    if (!canHumanAct || !selectedPiece) return null;
    return resolveGhostPlacement(
      board,
      turn,
      selectedPiece,
      rotation,
      flipped,
      activePointer,
      started,
      snapToCorner ? 2 : 0,
    );
  }, [activePointer, board, canHumanAct, flipped, rotation, selectedPiece, snapToCorner, started, turn]);

  const activeColor = players[turn]?.color ?? '#42b6ff';

  return (
    <div className="relative flex flex-col items-center justify-center">
      <div
        ref={stageRef}
        data-board-stage="true"
        data-board-size={board.size}
        onPointerMove={(e) => {
          if (e.pointerType === 'touch') return;
          const pt = clientCoordsToCell(e.clientX, e.clientY);
          setHoverPoint((prev) => (prev?.x === pt?.x && prev?.y === pt?.y ? prev : pt));
        }}
        onPointerLeave={() => setHoverPoint(null)}
        onPointerDown={(e) => {
          if (e.button === 2) return;
          const pt = clientCoordsToCell(e.clientX, e.clientY);
          if (pt) {
            onPlaceAtPointer(pt, e.pointerType === 'touch');
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onFlip();
        }}
        onWheel={(e) => {
          if (!canHumanAct || !selectedPiece) return;
          if (Math.abs(e.deltaY) > 4) {
            onRotate(e.deltaY > 0 ? 1 : -1);
          }
        }}
        className="relative aspect-square w-full max-w-[min(74vh,620px)] select-none overflow-hidden rounded-2xl bg-[#0d151a] shadow-2xl ring-1 ring-white/15 touch-none cursor-crosshair"
      >
        <CommittedBoardGrid
          size={board.size}
          cells={board.cells}
          startAnchors={board.startAnchors}
          mustCoverStart={board.mustCoverStart}
          playerColors={playerColors}
          lastMoveKeySet={lastMoveKeySet}
          colorblindMode={colorblindMode}
        />

        <TacticalOverlay
          board={board}
          turn={turn}
          playerColors={playerColors}
          showCornerHints={showCornerHints}
          showTerritoryOverlay={showTerritoryOverlay}
          canHumanAct={canHumanAct}
        />

        {ghost && (
          <div className="pointer-events-none absolute inset-0 z-[4]">
            {ghost.shape.map((cell, i) => {
              const gx = ghost.anchor.x + cell.x;
              const gy = ghost.anchor.y + cell.y;
              if (gx < 0 || gy < 0 || gx >= board.size || gy >= board.size) return null;
              const valid = ghost.validation.valid;
              return (
                <div
                  key={i}
                  className={`absolute rounded-[3px] transition-all duration-75 ${
                    valid
                      ? 'ring-2 ring-white/90 shadow-lg'
                      : 'ring-2 ring-rose-400/95 bg-rose-500/45'
                  }`}
                  style={{
                    left: `${(gx / board.size) * 100}%`,
                    top: `${(gy / board.size) * 100}%`,
                    width: `${100 / board.size}%`,
                    height: `${100 / board.size}%`,
                    backgroundColor: valid ? `${activeColor}b8` : undefined,
                  }}
                />
              );
            })}

            {!ghost.validation.valid && (hoverPoint || externalDragPoint) && ghost.validation.reason && (
              <div
                className="absolute z-[6] -translate-x-1/2 -translate-y-full rounded-lg bg-rose-950/95 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-rose-100 shadow-lg ring-1 ring-rose-400/50"
                style={{
                  left: `${Math.min(82, Math.max(18, ((ghost.anchor.x + 1) / board.size) * 100))}%`,
                  top: `${Math.max(8, (ghost.anchor.y / board.size) * 100 - 2)}%`,
                }}
              >
                {ghost.validation.reason}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
