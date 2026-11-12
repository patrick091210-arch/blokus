import {
  DIAGONAL_DIRS,
  EMPTY_CELL,
  ORTHOGONAL_DIRS,
  hasLegalMoveForPieceOnBoard,
  indexToPoint,
} from './board.ts';
import type { BoardState, Point, TerritorySummary } from './types.ts';

export const CONTESTED_TERRITORY = -2;
export const UNREACHABLE_TERRITORY = -1;

const ALL_EIGHT_DIRS: readonly Point[] = [...ORTHOGONAL_DIRS, ...DIAGONAL_DIRS];

export function computePlayablePieces(
  board: BoardState,
  colorId: number,
  availablePieces: readonly string[],
): Set<string> {
  const playable = new Set<string>();
  if ((board.frontierSets[colorId]?.length ?? 0) === 0) return playable;
  for (const pieceId of availablePieces) {
    if (hasLegalMoveForPieceOnBoard(board, colorId, pieceId)) {
      playable.add(pieceId);
    }
  }
  return playable;
}

export function getCornerHints(board: BoardState, colorId: number): Point[] {
  const frontier = board.frontierSets[colorId] ?? [];
  return frontier.map((idx) => indexToPoint(board.size, idx));
}

export function computeTerritoryMap(board: BoardState): TerritorySummary {
  const { size, colorCount, cells, forbiddenMasks, frontierSets } = board;
  const total = size * size;
  const ownerByCell = new Int8Array(total).fill(UNREACHABLE_TERRITORY);
  const distanceByCell = new Uint8Array(total).fill(255);

  // Per-color visited matrix to avoid revisiting cells for the same color
  const visitedByColor = Array.from({ length: colorCount }, () => new Uint8Array(total));
  let frontierQueue: { idx: number; color: number; dist: number }[] = [];

  for (let color = 0; color < colorCount; color += 1) {
    const seeds = frontierSets[color] ?? [];
    for (let i = 0; i < seeds.length; i += 1) {
      const idx = seeds[i];
      if (cells[idx] !== EMPTY_CELL) continue;
      visitedByColor[color][idx] = 1;
      frontierQueue.push({ idx, color, dist: 1 });
    }
  }

  // Level-synchronous multi-source BFS
  const maxDepth = 10;
  for (let depth = 1; depth <= maxDepth && frontierQueue.length > 0; depth += 1) {
    for (let i = 0; i < frontierQueue.length; i += 1) {
      const { idx, color, dist } = frontierQueue[i];
      const existingDist = distanceByCell[idx];
      if (dist < existingDist) {
        distanceByCell[idx] = dist;
        ownerByCell[idx] = color;
      } else if (dist === existingDist && ownerByCell[idx] !== color) {
        ownerByCell[idx] = CONTESTED_TERRITORY;
      }
    }

    const nextQueue: { idx: number; color: number; dist: number }[] = [];
    for (let i = 0; i < frontierQueue.length; i += 1) {
      const { idx, color, dist } = frontierQueue[i];
      if (distanceByCell[idx] < dist) continue;
      const x = idx % size;
      const y = (idx - x) / size;
      const mask = forbiddenMasks[color];
      const visited = visitedByColor[color];

      for (let d = 0; d < ALL_EIGHT_DIRS.length; d += 1) {
        const dir = ALL_EIGHT_DIRS[d];
        const nx = x + dir.x;
        const ny = y + dir.y;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const nIdx = ny * size + nx;
        if (visited[nIdx] !== 0 || mask[nIdx] !== 0) continue;
        visited[nIdx] = 1;
        nextQueue.push({ idx: nIdx, color, dist: dist + 1 });
      }
    }
    frontierQueue = nextQueue;
  }

  const counts = new Array<number>(colorCount).fill(0);
  for (let idx = 0; idx < total; idx += 1) {
    const owner = ownerByCell[idx];
    if (owner >= 0 && owner < colorCount) {
      counts[owner] += 1;
    }
  }

  return {
    ownerByCell,
    distanceByCell,
    counts,
  };
}
