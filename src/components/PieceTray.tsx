import { memo, useRef } from 'react';
import { PIECE_GROUPS_DESC, getShape } from '../engine/index.ts';
import type { PieceDefinition, PieceSize, Point } from '../engine/index.ts';

type PieceTrayProps = {
  readonly color: string;
  readonly colorId: number;
  readonly colorblindMode: boolean;
  readonly available: readonly string[];
  readonly playablePieces: ReadonlySet<string>;
  readonly selectedPiece: string | null;
  readonly rotation: number;
  readonly flipped: boolean;
  readonly sizeFilter: PieceSize | null;
  readonly canHumanAct: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onSelectPiece: (pieceId: string) => void;
  readonly onRotate: () => void;
  readonly onFlip: () => void;
  readonly onConfirmPlace: () => void;
  readonly onSetSizeFilter: (size: PieceSize | null) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
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

const MiniPieceThumb = memo(function MiniPieceThumb({
  pieceId,
  rotation,
  flipped,
  color,
  colorId,
  colorblindMode,
}: {
  readonly pieceId: string;
  readonly rotation: number;
  readonly flipped: boolean;
  readonly color: string;
  readonly colorId: number;
  readonly colorblindMode: boolean;
}) {
  const shape = getShape(pieceId, rotation, flipped);
  const maxX = Math.max(0, ...shape.map((c) => c.x));
  const maxY = Math.max(0, ...shape.map((c) => c.y));
  const cols = maxX + 1;
  const rows = maxY + 1;
  const filled = new Set(shape.map((c) => `${c.x},${c.y}`));

  return (
    <div
      className="grid gap-[1.5px]"
      style={{
        gridTemplateColumns: `repeat(${cols}, 9px)`,
        gridTemplateRows: `repeat(${rows}, 9px)`,
      }}
    >
      {Array.from({ length: rows * cols }, (_, idx) => {
        const x = idx % cols;
        const y = Math.floor(idx / cols);
        const on = filled.has(`${x},${y}`);
        return (
          <span
            key={idx}
            className={`rounded-[1.5px] ${
              on ? (colorblindMode ? `cb-pattern-${colorId % 4}` : '') : 'opacity-0'
            }`}
            style={on ? { backgroundColor: color } : undefined}
          />
        );
      })}
    </div>
  );
});

export const PieceTray = memo(function PieceTray({
  color,
  colorId,
  colorblindMode,
  available,
  playablePieces,
  selectedPiece,
  rotation,
  flipped,
  sizeFilter,
  canHumanAct,
  canUndo,
  canRedo,
  onSelectPiece,
  onRotate,
  onFlip,
  onConfirmPlace,
  onSetSizeFilter,
  onUndo,
  onRedo,
  onDragBoardPoint,
  onDropAtBoardPoint,
}: PieceTrayProps) {
  const availSet = new Set(available);
  const dragStateRef = useRef<{
    pieceId: string;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);

  const startPointerDrag = (piece: PieceDefinition, e: React.PointerEvent<HTMLButtonElement>) => {
    if (!canHumanAct || !availSet.has(piece.id) || e.button === 2) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      pieceId: piece.id,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
    };
  };

  const movePointerDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = dragStateRef.current;
    if (!st) return;
    const dist = Math.hypot(e.clientX - st.startX, e.clientY - st.startY);
    if (!st.dragging && dist > 7) {
      st.dragging = true;
      if (selectedPiece !== st.pieceId) {
        onSelectPiece(st.pieceId);
      }
    }
    if (st.dragging) {
      onDragBoardPoint(resolveBoardPointFromClient(e.clientX, e.clientY));
    }
  };

  const endPointerDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = dragStateRef.current;
    dragStateRef.current = null;
    if (!st) return;
    if (st.dragging) {
      const dropPt = resolveBoardPointFromClient(e.clientX, e.clientY);
      onDragBoardPoint(null);
      if (dropPt) {
        onDropAtBoardPoint(dropPt);
      }
    } else {
      onSelectPiece(st.pieceId);
    }
  };

  return (
    <section
      aria-label="Piece tray"
      className="flex flex-col rounded-2xl bg-[#141f26]/95 p-3.5 ring-1 ring-white/10"
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Tray ({available.length}/21)
          </span>
          <span className="text-[11px] text-slate-400">
            · {playablePieces.size} playable
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onSetSizeFilter(null)}
            className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
              sizeFilter === null ? 'bg-white/20 text-white' : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            All
          </button>
          {([5, 4, 3, 2, 1] as PieceSize[]).map((sz) => (
            <button
              key={sz}
              type="button"
              onClick={() => onSetSizeFilter(sz)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
                sizeFilter === sz ? 'bg-amber-400 text-slate-950' : 'bg-white/5 text-slate-400 hover:text-white'
              }`}
              title={`Filter ${sz}-square pieces (Shortcut ${sz})`}
            >
              {sz}■
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-5 gap-1.5">
        <button
          type="button"
          disabled={!canHumanAct || !selectedPiece}
          onClick={onRotate}
          className="rounded-xl bg-white/8 py-2 text-xs font-bold text-slate-100 ring-1 ring-white/10 transition hover:bg-white/15 disabled:opacity-35"
        >
          ↻ Rotate
        </button>
        <button
          type="button"
          disabled={!canHumanAct || !selectedPiece}
          onClick={onFlip}
          className="rounded-xl bg-white/8 py-2 text-xs font-bold text-slate-100 ring-1 ring-white/10 transition hover:bg-white/15 disabled:opacity-35"
        >
          ⇄ Mirror
        </button>
        <button
          type="button"
          disabled={!canHumanAct || !selectedPiece}
          onClick={onConfirmPlace}
          className="rounded-xl bg-amber-400/90 py-2 text-xs font-black text-slate-950 transition hover:bg-amber-300 disabled:opacity-35"
        >
          ✓ Place
        </button>
        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          className="rounded-xl bg-white/8 py-2 text-xs font-bold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/15 disabled:opacity-35"
        >
          ↶ Undo
        </button>
        <button
          type="button"
          disabled={!canRedo}
          onClick={onRedo}
          className="rounded-xl bg-white/8 py-2 text-xs font-bold text-slate-200 ring-1 ring-white/10 transition hover:bg-white/15 disabled:opacity-35"
        >
          ↷ Redo
        </button>
      </div>

      <div className="max-h-[48vh] space-y-2.5 overflow-y-auto pr-1">
        {PIECE_GROUPS_DESC.filter((g) => sizeFilter === null || g.size === sizeFilter).map((group) => (
          <div key={group.size}>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {group.size}-Square Polyominoes
            </div>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-4">
              {group.pieces.map((piece) => {
                const isAvail = availSet.has(piece.id);
                const isSelected = selectedPiece === piece.id && isAvail;
                const isPlayable = isAvail && playablePieces.has(piece.id);

                return (
                  <button
                    key={piece.id}
                    type="button"
                    disabled={!canHumanAct || !isAvail}
                    onPointerDown={(e) => startPointerDrag(piece, e)}
                    onPointerMove={movePointerDrag}
                    onPointerUp={endPointerDrag}
                    onPointerCancel={() => {
                      dragStateRef.current = null;
                      onDragBoardPoint(null);
                    }}
                    title={
                      !isAvail
                        ? `${piece.id} (Placed)`
                        : !isPlayable
                          ? `${piece.id} — Dead piece (no legal pocket on board)`
                          : `${piece.id} (${piece.size} squares) — Click to select/rotate, or drag onto board`
                    }
                    className={`relative flex min-h-[54px] flex-col items-center justify-center rounded-xl p-1.5 transition select-none touch-none ${
                      !isAvail
                        ? 'bg-black/20 opacity-20 grayscale'
                        : isSelected
                          ? 'bg-white/15 ring-2 ring-amber-400 shadow-md'
                          : !isPlayable
                            ? 'bg-rose-950/20 opacity-40 ring-1 ring-rose-400/20'
                            : 'bg-white/[0.045] ring-1 ring-white/10 hover:bg-white/10'
                    }`}
                  >
                    <MiniPieceThumb
                      pieceId={piece.id}
                      rotation={isSelected ? rotation : 0}
                      flipped={isSelected ? flipped : false}
                      color={color}
                      colorId={colorId}
                      colorblindMode={colorblindMode}
                    />
                    <span className="mt-1 text-[9px] font-bold tracking-wider text-slate-400">
                      {piece.id}
                      {isAvail && !isPlayable ? ' · ×' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
});
