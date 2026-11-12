import type {
  CompiledOrientation,
  CompiledPiece,
  PieceDefinition,
  PieceSize,
  Point,
} from './types.ts';

export const PIECES: readonly PieceDefinition[] = [
  { id: 'M', label: '1', size: 1, cells: [{ x: 0, y: 0 }] },
  { id: 'D', label: '2', size: 2, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
  { id: 'I3', label: 'I3', size: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] },
  { id: 'V3', label: 'V3', size: 3, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] },
  { id: 'I4', label: 'I4', size: 4, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] },
  { id: 'O4', label: 'O4', size: 4, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] },
  { id: 'T4', label: 'T4', size: 4, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }] },
  { id: 'L4', label: 'L4', size: 4, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }] },
  { id: 'S4', label: 'S4', size: 4, cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] },
  { id: 'F', label: 'F', size: 5, cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }] },
  { id: 'I5', label: 'I5', size: 5, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }, { x: 0, y: 4 }] },
  { id: 'L5', label: 'L5', size: 5, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }, { x: 1, y: 3 }] },
  { id: 'P', label: 'P', size: 5, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 2 }] },
  { id: 'N', label: 'N', size: 5, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }] },
  { id: 'T5', label: 'T5', size: 5, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }] },
  { id: 'U', label: 'U', size: 5, cells: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }] },
  { id: 'V5', label: 'V5', size: 5, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }] },
  { id: 'W', label: 'W', size: 5, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }] },
  { id: 'X', label: 'X', size: 5, cells: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }] },
  { id: 'Y', label: 'Y', size: 5, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }, { x: 1, y: 1 }] },
  { id: 'Z', label: 'Z', size: 5, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }] },
];

export const TOTAL_SQUARES_PER_SET = 89;

export const PIECE_BY_ID: Readonly<Record<string, PieceDefinition>> = Object.fromEntries(
  PIECES.map((piece) => [piece.id, piece]),
);

export const PIECES_BY_SIZE_DESC: readonly PieceDefinition[] = [...PIECES].sort(
  (a, b) => b.size - a.size || a.id.localeCompare(b.id),
);

export const PIECE_GROUPS_DESC: readonly { readonly size: PieceSize; readonly pieces: readonly PieceDefinition[] }[] = (
  [5, 4, 3, 2, 1] as const
).map((size) => ({
  size,
  pieces: PIECES.filter((piece) => piece.size === size),
}));

function normalizeShape(cells: readonly Point[]): Point[] {
  const minX = Math.min(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  return cells
    .map((cell) => ({ x: cell.x - minX, y: cell.y - minY }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function computeRawShape(cells: readonly Point[], rotation: number, flipped: boolean): Point[] {
  const turns = ((rotation % 4) + 4) % 4;
  const transformed = cells.map((cell) => {
    let { x, y } = cell;
    if (flipped) x = -x;
    for (let turn = 0; turn < turns; turn += 1) {
      [x, y] = [-y, x];
    }
    return { x, y };
  });
  return normalizeShape(transformed);
}

export function getShapeHandle(shape: readonly Point[]): Point {
  if (shape.length === 0) return { x: 0, y: 0 };
  const avgX = shape.reduce((sum, cell) => sum + cell.x, 0) / shape.length;
  const avgY = shape.reduce((sum, cell) => sum + cell.y, 0) / shape.length;
  return shape.reduce((best, cell) => {
    const bestDist = (best.x - avgX) ** 2 + (best.y - avgY) ** 2;
    const cellDist = (cell.x - avgX) ** 2 + (cell.y - avgY) ** 2;
    if (cellDist < bestDist - 1e-6) return cell;
    if (Math.abs(cellDist - bestDist) <= 1e-6 && (cell.y < best.y || (cell.y === best.y && cell.x < best.x))) {
      return cell;
    }
    return best;
  }, shape[0]);
}

function transformSlot(rotation: number, flipped: boolean): number {
  return (flipped ? 4 : 0) + (((rotation % 4) + 4) % 4);
}

function compilePiece(piece: PieceDefinition): CompiledPiece {
  const keyToIndex = new Map<string, number>();
  const orientations: CompiledOrientation[] = [];
  const lookupByTransform: number[] = new Array(8).fill(0);

  for (const flipped of [false, true]) {
    for (let rotation = 0; rotation < 4; rotation += 1) {
      const shape = computeRawShape(piece.cells, rotation, flipped);
      const key = shape.map((cell) => `${cell.x},${cell.y}`).join('|');
      let index = keyToIndex.get(key);
      if (index === undefined) {
        index = orientations.length;
        keyToIndex.set(key, index);
        const maxX = Math.max(...shape.map((cell) => cell.x));
        const maxY = Math.max(...shape.map((cell) => cell.y));
        orientations.push({
          index,
          rotation,
          flipped,
          shape,
          width: maxX + 1,
          height: maxY + 1,
          handle: getShapeHandle(shape),
          key,
        });
      }
      lookupByTransform[transformSlot(rotation, flipped)] = index;
    }
  }

  const nextRotateIndex = orientations.map((ori) => {
    for (let step = 1; step <= 3; step += 1) {
      const candidate = lookupByTransform[transformSlot(ori.rotation + step, ori.flipped)];
      if (candidate !== ori.index) return candidate;
    }
    return (ori.index + 1) % orientations.length;
  });

  const nextFlipIndex = orientations.map((ori) =>
    lookupByTransform[transformSlot(ori.rotation, !ori.flipped)],
  );

  return {
    id: piece.id,
    label: piece.label,
    size: piece.size,
    cells: piece.cells,
    orientations,
    lookupByTransform,
    nextRotateIndex,
    nextFlipIndex,
  };
}

export const COMPILED_PIECES: readonly CompiledPiece[] = PIECES.map(compilePiece);

export const COMPILED_PIECE_BY_ID: Readonly<Record<string, CompiledPiece>> = Object.fromEntries(
  COMPILED_PIECES.map((piece) => [piece.id, piece]),
);

export function getCompiledOrientation(
  pieceId: string,
  rotation = 0,
  flipped = false,
): CompiledOrientation | null {
  const compiled = COMPILED_PIECE_BY_ID[pieceId];
  if (!compiled) return null;
  const idx = compiled.lookupByTransform[transformSlot(rotation, flipped)];
  return compiled.orientations[idx] ?? null;
}

export function getShape(pieceId: string, rotation = 0, flipped = false): readonly Point[] {
  return getCompiledOrientation(pieceId, rotation, flipped)?.shape ?? [];
}

export function getOrientations(pieceId: string): readonly CompiledOrientation[] {
  return COMPILED_PIECE_BY_ID[pieceId]?.orientations ?? [];
}

export function getNextRotationTransform(
  pieceId: string,
  rotation: number,
  flipped: boolean,
): { rotation: number; flipped: boolean; changed: boolean } {
  const compiled = COMPILED_PIECE_BY_ID[pieceId];
  if (!compiled) return { rotation, flipped, changed: false };
  const currentIdx = compiled.lookupByTransform[transformSlot(rotation, flipped)];
  const nextIdx = compiled.nextRotateIndex[currentIdx] ?? currentIdx;
  const nextOri = compiled.orientations[nextIdx];
  return {
    rotation: nextOri.rotation,
    flipped: nextOri.flipped,
    changed: nextIdx !== currentIdx,
  };
}

export function getNextFlipTransform(
  pieceId: string,
  rotation: number,
  flipped: boolean,
): { rotation: number; flipped: boolean; changed: boolean } {
  const compiled = COMPILED_PIECE_BY_ID[pieceId];
  if (!compiled) return { rotation, flipped, changed: false };
  const currentIdx = compiled.lookupByTransform[transformSlot(rotation, flipped)];
  const nextIdx = compiled.nextFlipIndex[currentIdx] ?? currentIdx;
  const nextOri = compiled.orientations[nextIdx];
  return {
    rotation: nextOri.rotation,
    flipped: nextOri.flipped,
    changed: nextIdx !== currentIdx,
  };
}

export function getAnchorFromPoint(shape: readonly Point[], point: Point, boardSize: number): Point {
  if (shape.length === 0) return point;
  const handle = getShapeHandle(shape);
  let maxX = 0;
  let maxY = 0;
  for (const cell of shape) {
    if (cell.x > maxX) maxX = cell.x;
    if (cell.y > maxY) maxY = cell.y;
  }
  return {
    x: Math.max(0, Math.min(boardSize - 1 - maxX, point.x - handle.x)),
    y: Math.max(0, Math.min(boardSize - 1 - maxY, point.y - handle.y)),
  };
}

export function getPointFromAnchor(shape: readonly Point[], anchor: Point, boardSize: number): Point {
  const handle = getShapeHandle(shape);
  return {
    x: Math.max(0, Math.min(boardSize - 1, anchor.x + handle.x)),
    y: Math.max(0, Math.min(boardSize - 1, anchor.y + handle.y)),
  };
}
