import {
  getAnchorFromPoint,
  getOrientations,
  getShape,
} from './pieces.ts';
import type {
  BoardConfig,
  BoardState,
  Move,
  PlacementValidation,
  Point,
} from './types.ts';

export const EMPTY_CELL = -1;
export const OBSTACLE_CELL = -2;

export const CLASSIC_BOARD_SIZE = 20;
export const DUO_BOARD_SIZE = 14;

export const PLAYER_COLORS = ['#1684ff', '#f5a518', '#ef2d4a', '#0dbb85'] as const;
export const PLAYER_NAMES = ['Blue', 'Amber', 'Coral', 'Jade'] as const;

export const CLASSIC_START_CORNERS: readonly Point[] = [
  { x: 0, y: 0 },
  { x: CLASSIC_BOARD_SIZE - 1, y: 0 },
  { x: CLASSIC_BOARD_SIZE - 1, y: CLASSIC_BOARD_SIZE - 1 },
  { x: 0, y: CLASSIC_BOARD_SIZE - 1 },
];

export const DUO_START_ANCHORS: readonly Point[] = [
  { x: 4, y: 4 },
  { x: 9, y: 9 },
];

export const ORTHOGONAL_DIRS: readonly Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export const DIAGONAL_DIRS: readonly Point[] = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: 1 },
];

export function cellIndex(size: number, x: number, y: number): number {
  return y * size + x;
}

export function indexToPoint(size: number, index: number): Point {
  return { x: index % size, y: Math.floor(index / size) };
}

export function hasColorStarted(board: BoardState, colorId: number): boolean {
  return board.cells.some((owner) => owner === colorId);
}

export function computeCachesFromCells(
  size: number,
  colorCount: number,
  startAnchors: readonly Point[],
  mustCoverStart: boolean,
  cells: readonly number[],
): { forbiddenMasks: Uint8Array[]; frontierSets: number[][] } {
  const total = size * size;
  const forbiddenMasks: Uint8Array[] = [];
  const frontierSets: number[][] = [];

  for (let colorId = 0; colorId < colorCount; colorId += 1) {
    const mask = new Uint8Array(total);
    let started = false;

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const idx = y * size + x;
        const owner = cells[idx];
        if (owner !== EMPTY_CELL) {
          mask[idx] = 1;
          if (owner === colorId) {
            started = true;
            for (const dir of ORTHOGONAL_DIRS) {
              const nx = x + dir.x;
              const ny = y + dir.y;
              if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
                mask[ny * size + nx] = 1;
              }
            }
          }
        }
      }
    }

    const frontier: number[] = [];
    if (!started) {
      if (mustCoverStart) {
        const start = startAnchors[colorId];
        if (start && start.x >= 0 && start.y >= 0 && start.x < size && start.y < size) {
          const sIdx = start.y * size + start.x;
          if (mask[sIdx] === 0) frontier.push(sIdx);
        }
      } else {
        for (let idx = 0; idx < total; idx += 1) {
          if (mask[idx] === 0) frontier.push(idx);
        }
      }
    } else {
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const idx = y * size + x;
          if (mask[idx] !== 0) continue;
          for (const dir of DIAGONAL_DIRS) {
            const nx = x + dir.x;
            const ny = y + dir.y;
            if (nx >= 0 && ny >= 0 && nx < size && ny < size && cells[ny * size + nx] === colorId) {
              frontier.push(idx);
              break;
            }
          }
        }
      }
    }

    forbiddenMasks.push(mask);
    frontierSets.push(frontier);
  }

  return { forbiddenMasks, frontierSets };
}

export function createBoardState(config: BoardConfig): BoardState {
  const total = config.size * config.size;
  const cells = config.initialCells
    ? config.initialCells.slice(0, total)
    : new Array<number>(total).fill(EMPTY_CELL);
  const { forbiddenMasks, frontierSets } = computeCachesFromCells(
    config.size,
    config.colorCount,
    config.startAnchors,
    config.mustCoverStart,
    cells,
  );
  return {
    size: config.size,
    colorCount: config.colorCount,
    startAnchors: config.startAnchors,
    mustCoverStart: config.mustCoverStart,
    cells,
    forbiddenMasks,
    frontierSets,
  };
}

export function createClassicBoard(): BoardState {
  return createBoardState({
    size: CLASSIC_BOARD_SIZE,
    colorCount: 4,
    startAnchors: CLASSIC_START_CORNERS,
    mustCoverStart: true,
  });
}

export function createDuoBoard(): BoardState {
  return createBoardState({
    size: DUO_BOARD_SIZE,
    colorCount: 2,
    startAnchors: DUO_START_ANCHORS,
    mustCoverStart: true,
  });
}

export function validatePlacementOnBoard(
  board: BoardState,
  colorId: number,
  shape: readonly Point[],
  anchor: Point,
  hasStarted: boolean,
): PlacementValidation {
  if (shape.length === 0) {
    return { valid: false, code: 'OUT_OF_BOUNDS', reason: 'Select a piece first.' };
  }

  const { size, cells, startAnchors, mustCoverStart } = board;
  const start = startAnchors[colorId];
  let diagonalContact = false;
  let coversStart = false;

  for (const cell of shape) {
    const x = anchor.x + cell.x;
    const y = anchor.y + cell.y;
    if (x < 0 || y < 0 || x >= size || y >= size) {
      return { valid: false, code: 'OUT_OF_BOUNDS', reason: 'Keep every square inside the board.' };
    }

    const idx = y * size + x;
    if (cells[idx] !== EMPTY_CELL) {
      return { valid: false, code: 'OCCUPIED', reason: 'That space is already occupied.' };
    }
    if (start && x === start.x && y === start.y) {
      coversStart = true;
    }

    for (const dir of ORTHOGONAL_DIRS) {
      const nx = x + dir.x;
      const ny = y + dir.y;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size && cells[ny * size + nx] === colorId) {
        return { valid: false, code: 'EDGE_CONTACT', reason: 'Your pieces cannot share an edge.' };
      }
    }

    for (const dir of DIAGONAL_DIRS) {
      const nx = x + dir.x;
      const ny = y + dir.y;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size && cells[ny * size + nx] === colorId) {
        diagonalContact = true;
      }
    }
  }

  if (!hasStarted && mustCoverStart && !coversStart) {
    return {
      valid: false,
      code: 'MISS_START',
      reason: 'Your first piece must cover your starting anchor.',
    };
  }
  if (hasStarted && !diagonalContact) {
    return {
      valid: false,
      code: 'NO_CORNER_CONTACT',
      reason: 'Connect to one of your pieces corner-to-corner.',
    };
  }
  return { valid: true };
}

export function applyPlacementToBoard(
  board: BoardState,
  colorId: number,
  shape: readonly Point[],
  anchor: Point,
  hadStartedBefore: boolean,
): BoardState {
  const { size, colorCount } = board;
  const nextCells = board.cells.slice();
  const placedIndices: number[] = [];
  const placedPoints: Point[] = [];

  for (const cell of shape) {
    const x = anchor.x + cell.x;
    const y = anchor.y + cell.y;
    const idx = y * size + x;
    nextCells[idx] = colorId;
    placedIndices.push(idx);
    placedPoints.push({ x, y });
  }

  const nextForbiddenMasks: Uint8Array[] = [];
  const nextFrontierSets: number[][] = [];
  const placedSet = new Set<number>(placedIndices);

  for (let c = 0; c < colorCount; c += 1) {
    const mask = board.forbiddenMasks[c].slice();
    for (const idx of placedIndices) {
      mask[idx] = 1;
    }

    if (c !== colorId) {
      const filteredFrontier = board.frontierSets[c].filter((idx) => !placedSet.has(idx));
      nextForbiddenMasks.push(mask);
      nextFrontierSets.push(filteredFrontier);
    } else {
      for (const pt of placedPoints) {
        for (const dir of ORTHOGONAL_DIRS) {
          const nx = pt.x + dir.x;
          const ny = pt.y + dir.y;
          if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
            mask[ny * size + nx] = 1;
          }
        }
      }

      const frontierSet = new Set<number>(
        hadStartedBefore ? board.frontierSets[c].filter((idx) => mask[idx] === 0) : [],
      );
      for (const pt of placedPoints) {
        for (const dir of DIAGONAL_DIRS) {
          const nx = pt.x + dir.x;
          const ny = pt.y + dir.y;
          if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
            const dIdx = ny * size + nx;
            if (mask[dIdx] === 0) {
              frontierSet.add(dIdx);
            }
          }
        }
      }
      const sortedFrontier = [...frontierSet].sort((a, b) => a - b);
      nextForbiddenMasks.push(mask);
      nextFrontierSets.push(sortedFrontier);
    }
  }

  return {
    ...board,
    cells: nextCells,
    forbiddenMasks: nextForbiddenMasks,
    frontierSets: nextFrontierSets,
  };
}

export function hasLegalMoveForPieceOnBoard(
  board: BoardState,
  colorId: number,
  pieceId: string,
): boolean {
  const frontier = board.frontierSets[colorId];
  if (!frontier || frontier.length === 0) return false;
  const mask = board.forbiddenMasks[colorId];
  const { size } = board;
  const orientations = getOrientations(pieceId);

  for (const ori of orientations) {
    const maxAnchorX = size - ori.width;
    const maxAnchorY = size - ori.height;
    if (maxAnchorX < 0 || maxAnchorY < 0) continue;

    for (let f = 0; f < frontier.length; f += 1) {
      const fIdx = frontier[f];
      const fx = fIdx % size;
      const fy = (fIdx - fx) / size;

      for (let s = 0; s < ori.shape.length; s += 1) {
        const cell = ori.shape[s];
        const ax = fx - cell.x;
        const ay = fy - cell.y;
        if (ax < 0 || ay < 0 || ax > maxAnchorX || ay > maxAnchorY) continue;

        let ok = true;
        for (let k = 0; k < ori.shape.length; k += 1) {
          const sc = ori.shape[k];
          if (mask[(ay + sc.y) * size + (ax + sc.x)] !== 0) {
            ok = false;
            break;
          }
        }
        if (ok) return true;
      }
    }
  }
  return false;
}

export function findLegalMovesForPieceOnBoard(
  board: BoardState,
  colorId: number,
  pieceId: string,
): Move[] {
  const frontier = board.frontierSets[colorId];
  if (!frontier || frontier.length === 0) return [];
  const mask = board.forbiddenMasks[colorId];
  const { size } = board;
  const total = size * size;
  const orientations = getOrientations(pieceId);
  const moves: Move[] = [];

  for (const ori of orientations) {
    const maxAnchorX = size - ori.width;
    const maxAnchorY = size - ori.height;
    if (maxAnchorX < 0 || maxAnchorY < 0) continue;
    const seenAnchors = new Uint8Array(total);

    for (let f = 0; f < frontier.length; f += 1) {
      const fIdx = frontier[f];
      const fx = fIdx % size;
      const fy = (fIdx - fx) / size;

      for (let s = 0; s < ori.shape.length; s += 1) {
        const cell = ori.shape[s];
        const ax = fx - cell.x;
        const ay = fy - cell.y;
        if (ax < 0 || ay < 0 || ax > maxAnchorX || ay > maxAnchorY) continue;

        const aIdx = ay * size + ax;
        if (seenAnchors[aIdx] !== 0) continue;
        seenAnchors[aIdx] = 1;

        let ok = true;
        for (let k = 0; k < ori.shape.length; k += 1) {
          const sc = ori.shape[k];
          if (mask[(ay + sc.y) * size + (ax + sc.x)] !== 0) {
            ok = false;
            break;
          }
        }
        if (ok) {
          moves.push({
            pieceId,
            x: ax,
            y: ay,
            rotation: ori.rotation,
            flipped: ori.flipped,
          });
        }
      }
    }
  }

  return moves;
}

export function findAnyLegalMoveOnBoard(
  board: BoardState,
  colorId: number,
  availablePieces: readonly string[],
): Move | null {
  if ((board.frontierSets[colorId]?.length ?? 0) === 0) return null;
  for (const pieceId of availablePieces) {
    const moves = findLegalMovesForPieceOnBoard(board, colorId, pieceId);
    if (moves.length > 0) return moves[0];
  }
  return null;
}

export function resolveGhostPlacement(
  board: BoardState,
  colorId: number,
  pieceId: string,
  rotation: number,
  flipped: boolean,
  pointer: Point,
  hasStarted: boolean,
  snapRadius = 2,
): {
  anchor: Point;
  shape: readonly Point[];
  validation: PlacementValidation;
  snapped: boolean;
} {
  const shape = getShape(pieceId, rotation, flipped);
  const rawAnchor = getAnchorFromPoint(shape, pointer, board.size);
  const directValidation = validatePlacementOnBoard(board, colorId, shape, rawAnchor, hasStarted);
  if (directValidation.valid || snapRadius <= 0) {
    return { anchor: rawAnchor, shape, validation: directValidation, snapped: false };
  }

  const frontier = board.frontierSets[colorId];
  const mask = board.forbiddenMasks[colorId];
  if (!frontier || frontier.length === 0) {
    return { anchor: rawAnchor, shape, validation: directValidation, snapped: false };
  }

  const { size } = board;
  let maxX = 0;
  let maxY = 0;
  for (const c of shape) {
    if (c.x > maxX) maxX = c.x;
    if (c.y > maxY) maxY = c.y;
  }
  const maxAnchorX = size - 1 - maxX;
  const maxAnchorY = size - 1 - maxY;

  let bestAnchor: Point | null = null;
  let bestDist = snapRadius + 1;

  for (let f = 0; f < frontier.length; f += 1) {
    const fIdx = frontier[f];
    const fx = fIdx % size;
    const fy = (fIdx - fx) / size;
    for (const cell of shape) {
      const ax = fx - cell.x;
      const ay = fy - cell.y;
      if (ax < 0 || ay < 0 || ax > maxAnchorX || ay > maxAnchorY) continue;
      const dist = Math.abs(ax - rawAnchor.x) + Math.abs(ay - rawAnchor.y);
      if (dist > snapRadius || dist >= bestDist) continue;

      let ok = true;
      for (const sc of shape) {
        if (mask[(ay + sc.y) * size + (ax + sc.x)] !== 0) {
          ok = false;
          break;
        }
      }
      if (ok) {
        bestDist = dist;
        bestAnchor = { x: ax, y: ay };
      }
    }
  }

  if (bestAnchor) {
    return {
      anchor: bestAnchor,
      shape,
      validation: { valid: true },
      snapped: true,
    };
  }

  return { anchor: rawAnchor, shape, validation: directValidation, snapped: false };
}
