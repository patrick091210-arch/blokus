import { memo, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { PIECES_BY_SIZE_DESC, getShape, getShapeHandle } from '../engine/index.ts';
import type { PieceDefinition, Point } from '../engine/index.ts';

export type TransformAnimEvent = {
  readonly serial: number;
  readonly kind: 'cw' | 'ccw' | 'flip';
};

type PieceTrayProps = {
  readonly color: string;
  readonly available: readonly string[];
  readonly playablePieces: ReadonlySet<string>;
  readonly selectedPiece: string | null;
  readonly isPiecePickedUp: boolean;
  readonly rotation: number;
  readonly flipped: boolean;
  readonly transformEvent: TransformAnimEvent;
  readonly pointerClient: { readonly x: number; readonly y: number } | null;
  readonly canHumanAct: boolean;
  readonly isGameOver: boolean;
  readonly onPickPiece: (pieceId: string, clientX: number, clientY: number) => void;
  readonly onDragBoardPoint: (point: Point | null) => void;
  readonly onDropAtBoardPoint: (point: Point) => void;
};

function resolveBoardPointFromClient(clientX: number, clientY: number): Point | null {
  if (typeof document === 'undefined') return null;
  const boardEl = document.querySelector<HTMLElement>('[data-board-stage="true"]');
  if (!boardEl) return null;
  const rect = boardEl.getBoundingClientRect();
  if (
    clientX < rect.left ||
    clientY < rect.top ||
    clientX > rect.right ||
    clientY > rect.bottom
  ) {
    return null;
  }
  const size = Number(boardEl.dataset.boardSize ?? '20');
  return {
    x: Math.min(size - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * size))),
    y: Math.min(size - 1, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * size))),
  };
}

const DockPolyominoGlyph = memo(function DockPolyominoGlyph({
  pieceId,
  color,
  unit = 9,
}: {
  readonly pieceId: string;
  readonly color: string;
  readonly unit?: number;
}) {
  const shape = getShape(pieceId, 0, false);
  const maxX = Math.max(0, ...shape.map((c) => c.x));
  const maxY = Math.max(0, ...shape.map((c) => c.y));
  const cols = maxX + 1;
  const rows = maxY + 1;
  const filled = new Set(shape.map((c) => `${c.x},${c.y}`));

  return (
    <div
      className="grid gap-[1.5px]"
      style={{
        gridTemplateColumns: `repeat(${cols}, ${unit}px)`,
        gridTemplateRows: `repeat(${rows}, ${unit}px)`,
      }}
    >
      {Array.from({ length: rows * cols }, (_, idx) => {
        const x = idx % cols;
        const y = Math.floor(idx / cols);
        const on = filled.has(`${x},${y}`);
        return (
          <span
            key={idx}
            className={on ? 'acrylic-tile rounded-[2px]' : 'opacity-0'}
            style={on ? ({ '--tile-color': color } as CSSProperties) : undefined}
          />
        );
      })}
    </div>
  );
});

/**
 * Cursor-following 3D Acrylic Held Piece with WAAPI true 3D spin (90°) and 3D flip (180°).
 */
function HeldFloatingPiece({
  pieceId,
  rotation,
  flipped,
  color,
  transformEvent,
  pointerClient,
}: {
  readonly pieceId: string;
  readonly rotation: number;
  readonly flipped: boolean;
  readonly color: string;
  readonly transformEvent: TransformAnimEvent;
  readonly pointerClient: { readonly x: number; readonly y: number };
}) {
  const animRef = useRef<HTMLDivElement | null>(null);
  const lastSerialRef = useRef<number>(transformEvent.serial);

  useEffect(() => {
    if (transformEvent.serial === lastSerialRef.current) return;
    lastSerialRef.current = transformEvent.serial;
    const el = animRef.current;
    if (!el || typeof el.animate !== 'function') return;

    if (transformEvent.kind === 'flip') {
      el.animate(
        [
          { transform: 'perspective(540px) translateZ(26px) rotateY(-180deg) scale(1.12)' },
          { transform: 'perspective(540px) translateZ(34px) rotateY(-90deg) scale(1.16)', offset: 0.48 },
          { transform: 'perspective(540px) translateZ(0px) rotateY(0deg) scale(1)' },
        ],
        { duration: 270, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    } else {
      const startDeg = transformEvent.kind === 'cw' ? -90 : 90;
      el.animate(
        [
          { transform: `perspective(540px) rotateZ(${startDeg}deg) scale(1.07)` },
          { transform: 'perspective(540px) rotateZ(0deg) scale(1)' },
        ],
        { duration: 215, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    }
  }, [transformEvent]);

  const shape = getShape(pieceId, rotation, flipped);
  const handle = getShapeHandle(shape);
  const maxX = Math.max(0, ...shape.map((c) => c.x));
  const maxY = Math.max(0, ...shape.map((c) => c.y));
  const cols = maxX + 1;
  const rows = maxY + 1;
  const filled = new Set(shape.map((c) => `${c.x},${c.y}`));
  const cellPx = 22;

  const offsetX = (handle.x + 0.5) * cellPx;
  const offsetY = (handle.y + 0.5) * cellPx;

  return (
    <div
      className="pointer-events-none fixed left-0 top-0 z-50"
      style={{
        transform: `translate3d(${(pointerClient.x - offsetX).toFixed(1)}px, ${(pointerClient.y - offsetY).toFixed(1)}px, 0)`,
      }}
    >
      <div
        ref={animRef}
        style={{
          transformStyle: 'preserve-3d',
          filter: 'drop-shadow(0 14px 20px rgba(0, 0, 0, 0.38))',
        }}
      >
        <div
          className="grid gap-[2px]"
          style={{
            gridTemplateColumns: `repeat(${cols}, ${cellPx - 2}px)`,
            gridTemplateRows: `repeat(${rows}, ${cellPx - 2}px)`,
          }}
        >
          {Array.from({ length: rows * cols }, (_, idx) => {
            const x = idx % cols;
            const y = Math.floor(idx / cols);
            const on = filled.has(`${x},${y}`);
            return (
              <span
                key={idx}
                className={on ? 'acrylic-tile rounded-[3px]' : 'opacity-0'}
                style={on ? ({ '--tile-color': color } as CSSProperties) : undefined}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const PieceTray = memo(function PieceTray({
  color,
  available,
  playablePieces,
  selectedPiece,
  isPiecePickedUp,
  rotation,
  flipped,
  transformEvent,
  pointerClient,
  canHumanAct,
  isGameOver,
  onPickPiece,
  onDragBoardPoint,
  onDropAtBoardPoint,
}: PieceTrayProps) {
  const availSet = new Set(available);
  const remainingPieces = PIECES_BY_SIZE_DESC.filter((p) => availSet.has(p.id));
  const dragRef = useRef<{
    pieceId: string;
    startX: number;
    startY: number;
    dragged: boolean;
  } | null>(null);

  const handlePointerDown = (piece: PieceDefinition, e: React.PointerEvent<HTMLButtonElement>) => {
    if (!canHumanAct || e.button === 2) return;
    if (!playablePieces.has(piece.id)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    onPickPiece(piece.id, e.clientX, e.clientY);
    dragRef.current = {
      pieceId: piece.id,
      startX: e.clientX,
      startY: e.clientY,
      dragged: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = dragRef.current;
    if (!st) return;
    if (!st.dragged && Math.hypot(e.clientX - st.startX, e.clientY - st.startY) > 7) {
      st.dragged = true;
    }
    if (st.dragged) {
      onDragBoardPoint(resolveBoardPointFromClient(e.clientX, e.clientY));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = dragRef.current;
    dragRef.current = null;
    if (!st) return;
    if (st.dragged) {
      const dropPt = resolveBoardPointFromClient(e.clientX, e.clientY);
      onDragBoardPoint(null);
      if (dropPt) {
        onDropAtBoardPoint(dropPt);
      }
    }
  };

  return (
    <>
      <div
        aria-label="Piece dock"
        className="flex flex-wrap items-center justify-center content-center gap-x-4 gap-y-3.5 px-2 transition-all duration-500 lg:max-w-[270px]"
        style={{
          opacity: isGameOver ? 0 : canHumanAct ? 1 : 0.18,
          transform: isGameOver
            ? 'translate3d(0, 12px, 0) scale(0.95)'
            : canHumanAct
              ? 'translate3d(0, 0, 0)'
              : 'translate3d(0, 4px, 0) scale(0.97)',
          pointerEvents: canHumanAct && !isGameOver ? 'auto' : 'none',
          transitionTimingFunction: 'var(--ease-spring)',
        }}
      >
        {remainingPieces.map((piece) => {
          const playable = playablePieces.has(piece.id);
          const isHeld = isPiecePickedUp && selectedPiece === piece.id;

          return (
            <button
              key={piece.id}
              type="button"
              disabled={!canHumanAct || !playable}
              onPointerDown={(e) => handlePointerDown(piece, e)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => {
                dragRef.current = null;
                onDragBoardPoint(null);
              }}
              aria-label={piece.id}
              className="group relative flex items-center justify-center p-1.5 touch-none transition-all duration-300"
              style={{
                opacity: !playable ? 0.14 : isHeld ? 0.22 : 0.92,
                transform: isHeld ? 'scale(0.86)' : 'scale(1)',
                filter: !playable ? 'saturate(0.25)' : 'none',
                transitionTimingFunction: 'var(--ease-spring)',
              }}
            >
              <div className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:scale-110">
                <DockPolyominoGlyph pieceId={piece.id} color={color} unit={8.5} />
              </div>
            </button>
          );
        })}
      </div>

      {canHumanAct && isPiecePickedUp && selectedPiece && pointerClient && (
        <HeldFloatingPiece
          pieceId={selectedPiece}
          rotation={rotation}
          flipped={flipped}
          color={color}
          transformEvent={transformEvent}
          pointerClient={pointerClient}
        />
      )}
    </>
  );
});
