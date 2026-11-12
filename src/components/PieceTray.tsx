import { memo, useEffect, useRef } from 'react';
import { PIECES_BY_SIZE_DESC, getShape, getShapeHandle } from '../engine/index.ts';
import type { PieceDefinition, Point } from '../engine/index.ts';
import { ConnectedPolyominoFigure } from './AcrylicPieceCell.tsx';

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

/**
 * Cursor-following Monolithic Acrylic Piece: elevated scale(1.04), 135° offset drop shadow,
 * and GPU WAAPI true 3D spin (90°) + 3D flip (180°).
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
          { transform: 'perspective(540px) translateZ(24px) rotateY(-180deg) scale3d(1.1, 1.1, 1)' },
          { transform: 'perspective(540px) translateZ(34px) rotateY(-90deg) scale3d(1.14, 1.14, 1)', offset: 0.48 },
          { transform: 'perspective(540px) translateZ(0px) rotateY(0deg) scale3d(1.04, 1.04, 1)' },
        ],
        { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    } else {
      const startDeg = transformEvent.kind === 'cw' ? -90 : 90;
      el.animate(
        [
          { transform: `perspective(540px) rotateZ(${startDeg}deg) scale3d(1.09, 1.09, 1)` },
          { transform: 'perspective(540px) rotateZ(0deg) scale3d(1.04, 1.04, 1)' },
        ],
        { duration: 210, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    }
  }, [transformEvent]);

  const shape = getShape(pieceId, rotation, flipped);
  const handle = getShapeHandle(shape);
  const cellPx = 24;
  const offsetX = Math.round((handle.x + 0.5) * cellPx);
  const offsetY = Math.round((handle.y + 0.5) * cellPx);

  return (
    <div
      className="pointer-events-none fixed left-0 top-0 z-50"
      style={{
        transform: `translate3d(${Math.round(pointerClient.x - offsetX)}px, ${Math.round(pointerClient.y - offsetY)}px, 0)`,
        willChange: 'transform',
      }}
    >
      <div
        ref={animRef}
        style={{
          transform: 'scale3d(1.04, 1.04, 1)',
          transformStyle: 'preserve-3d',
          filter: 'drop-shadow(7px 14px 16px rgba(0, 0, 0, 0.46))',
        }}
      >
        <ConnectedPolyominoFigure
          pieceId={pieceId}
          rotation={rotation}
          flipped={flipped}
          color={color}
          unitPx={cellPx}
          cornerRadiusPx={3}
          showFacet
        />
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
        className="flex flex-wrap items-center justify-center content-center gap-x-4 gap-y-3.5 px-2 transition-all duration-500 max-w-[340px] lg:w-[272px]"
        style={{
          opacity: isGameOver ? 0 : canHumanAct ? 1 : 0.2,
          transform: isGameOver
            ? 'translate3d(0, 12px, 0) scale3d(0.95, 0.95, 1)'
            : canHumanAct
              ? 'translate3d(0, 0, 0)'
              : 'translate3d(0, 4px, 0) scale3d(0.97, 0.97, 1)',
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
                opacity: !playable ? 0.14 : isHeld ? 0.2 : 0.94,
                transform: isHeld ? 'scale3d(0.86, 0.86, 1)' : 'scale3d(1, 1, 1)',
                filter: !playable
                  ? 'saturate(0.2)'
                  : 'drop-shadow(2px 4px 6px rgba(0, 0, 0, 0.28))',
                transitionTimingFunction: 'var(--ease-spring)',
              }}
            >
              <div className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:scale-110">
                <ConnectedPolyominoFigure
                  pieceId={piece.id}
                  color={color}
                  unitPx={10}
                  cornerRadiusPx={2}
                  showFacet
                />
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
