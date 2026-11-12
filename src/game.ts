export const BOARD_SIZE = 20;

export type Point = { x: number; y: number };

export type PieceDefinition = {
  id: string;
  label: string;
  cells: Point[];
};

export type Move = {
  pieceId: string;
  x: number;
  y: number;
  rotation: number;
  flipped: boolean;
};

export const PIECES: PieceDefinition[] = [
  { id: 'M', label: '1', cells: [{ x: 0, y: 0 }] },
  { id: 'D', label: '2', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
  { id: 'I3', label: 'I3', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] },
  { id: 'V3', label: 'V3', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] },
  { id: 'I4', label: 'I4', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] },
  { id: 'O4', label: 'O4', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] },
  { id: 'T4', label: 'T4', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }] },
  { id: 'L4', label: 'L4', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }] },
  { id: 'S4', label: 'S4', cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] },
  { id: 'F', label: 'F', cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }] },
  { id: 'I5', label: 'I5', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }, { x: 0, y: 4 }] },
  { id: 'L5', label: 'L5', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }, { x: 1, y: 3 }] },
  { id: 'P', label: 'P', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 2 }] },
  { id: 'N', label: 'N', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }] },
  { id: 'T5', label: 'T5', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }] },
  { id: 'U', label: 'U', cells: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }] },
  { id: 'V5', label: 'V5', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }] },
  { id: 'W', label: 'W', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }] },
  { id: 'X', label: 'X', cells: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }] },
  { id: 'Y', label: 'Y', cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }, { x: 1, y: 1 }] },
  { id: 'Z', label: 'Z', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }] },
];

export const PIECE_BY_ID = Object.fromEntries(PIECES.map((piece) => [piece.id, piece])) as Record<string, PieceDefinition>;

export const PLAYER_COLORS = ['#42b6ff', '#ffb447', '#ff5c70', '#51d7a4'];
export const PLAYER_NAMES = ['Blue', 'Amber', 'Coral', 'Jade'];
export const START_CORNERS: Point[] = [
  { x: 0, y: 0 },
  { x: BOARD_SIZE - 1, y: 0 },
  { x: BOARD_SIZE - 1, y: BOARD_SIZE - 1 },
  { x: 0, y: BOARD_SIZE - 1 },
];

const orthogonalDirections = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];
const diagonalDirections = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: 1 },
];

function normalizeShape(cells: Point[]): Point[] {
  const minX = Math.min(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  return cells
    .map((cell) => ({ x: cell.x - minX, y: cell.y - minY }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

export function getShape(pieceId: string, rotation = 0, flipped = false): Point[] {
  const piece = PIECE_BY_ID[pieceId];
  if (!piece) return [];

  const transformed = piece.cells.map((cell) => {
    let { x, y } = cell;
    if (flipped) x = -x;
    for (let turn = 0; turn < ((rotation % 4) + 4) % 4; turn += 1) {
      [x, y] = [-y, x];
    }
    return { x, y };
  });

  return normalizeShape(transformed);
}

type Orientation = { rotation: number; flipped: boolean; shape: Point[] };

function getOrientations(pieceId: string): Orientation[] {
  const seen = new Set<string>();
  const options: Orientation[] = [];

  for (const flipped of [false, true]) {
    for (let rotation = 0; rotation < 4; rotation += 1) {
      const shape = getShape(pieceId, rotation, flipped);
      const key = shape.map((cell) => `${cell.x},${cell.y}`).join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({ rotation, flipped, shape });
    }
  }

  return options;
}

function boardIndex(x: number, y: number): number {
  return y * BOARD_SIZE + x;
}

export function validatePlacement(
  board: number[],
  playerId: number,
  shape: Point[],
  anchor: Point,
  hasStarted: boolean,
): { valid: boolean; reason?: string } {
  let diagonalContact = false;
  let coversStart = false;
  const start = START_CORNERS[playerId];

  for (const cell of shape) {
    const x = anchor.x + cell.x;
    const y = anchor.y + cell.y;
    if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) {
      return { valid: false, reason: 'Keep every square inside the board.' };
    }

    const index = boardIndex(x, y);
    if (board[index] !== -1) return { valid: false, reason: 'That space is already occupied.' };
    if (x === start.x && y === start.y) coversStart = true;

    for (const direction of orthogonalDirections) {
      const nextX = x + direction.x;
      const nextY = y + direction.y;
      if (
        nextX >= 0 && nextY >= 0 && nextX < BOARD_SIZE && nextY < BOARD_SIZE &&
        board[boardIndex(nextX, nextY)] === playerId
      ) {
        return { valid: false, reason: 'Your pieces can only touch at the corners.' };
      }
    }

    for (const direction of diagonalDirections) {
      const nextX = x + direction.x;
      const nextY = y + direction.y;
      if (
        nextX >= 0 && nextY >= 0 && nextX < BOARD_SIZE && nextY < BOARD_SIZE &&
        board[boardIndex(nextX, nextY)] === playerId
      ) {
        diagonalContact = true;
      }
    }
  }

  if (!hasStarted && !coversStart) {
    return { valid: false, reason: 'Your first piece must cover your colored corner.' };
  }
  if (hasStarted && !diagonalContact) {
    return { valid: false, reason: 'Connect to one of your pieces by a corner.' };
  }
  return { valid: true };
}

function candidateAnchors(board: number[], playerId: number, shape: Point[], hasStarted: boolean): Point[] {
  const anchors = new Map<string, Point>();
  const add = (x: number, y: number) => anchors.set(`${x},${y}`, { x, y });

  if (!hasStarted) {
    const corner = START_CORNERS[playerId];
    for (const cell of shape) add(corner.x - cell.x, corner.y - cell.y);
    return [...anchors.values()];
  }

  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (board[boardIndex(x, y)] !== playerId) continue;
      for (const direction of diagonalDirections) {
        for (const cell of shape) add(x + direction.x - cell.x, y + direction.y - cell.y);
      }
    }
  }

  return [...anchors.values()];
}

export function getShapeHandle(shape: Point[]): Point {
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

export function getAnchorFromPoint(shape: Point[], point: Point): Point {
  if (shape.length === 0) return point;
  const handle = getShapeHandle(shape);
  const maxX = Math.max(...shape.map((cell) => cell.x));
  const maxY = Math.max(...shape.map((cell) => cell.y));
  return {
    x: Math.max(0, Math.min(BOARD_SIZE - 1 - maxX, point.x - handle.x)),
    y: Math.max(0, Math.min(BOARD_SIZE - 1 - maxY, point.y - handle.y)),
  };
}

export function getPointFromAnchor(shape: Point[], anchor: Point): Point {
  const handle = getShapeHandle(shape);
  return {
    x: Math.max(0, Math.min(BOARD_SIZE - 1, anchor.x + handle.x)),
    y: Math.max(0, Math.min(BOARD_SIZE - 1, anchor.y + handle.y)),
  };
}

export function hasLegalMoveForPiece(
  board: number[],
  playerId: number,
  pieceId: string,
  hasStarted: boolean,
): boolean {
  for (const orientation of getOrientations(pieceId)) {
    for (const anchor of candidateAnchors(board, playerId, orientation.shape, hasStarted)) {
      if (validatePlacement(board, playerId, orientation.shape, anchor, hasStarted).valid) {
        return true;
      }
    }
  }
  return false;
}

export function findLegalMovesForPiece(
  board: number[],
  playerId: number,
  pieceId: string,
  hasStarted: boolean,
): Move[] {
  const moves: Move[] = [];
  const uniqueMoves = new Set<string>();

  for (const orientation of getOrientations(pieceId)) {
    for (const anchor of candidateAnchors(board, playerId, orientation.shape, hasStarted)) {
      if (!validatePlacement(board, playerId, orientation.shape, anchor, hasStarted).valid) continue;
      const key = `${anchor.x},${anchor.y},${orientation.shape.map((cell) => `${cell.x}:${cell.y}`).join('|')}`;
      if (uniqueMoves.has(key)) continue;
      uniqueMoves.add(key);
      moves.push({ pieceId, x: anchor.x, y: anchor.y, rotation: orientation.rotation, flipped: orientation.flipped });
    }
  }

  return moves;
}

export function findBestMove(
  board: number[],
  playerId: number,
  availablePieces: string[],
  hasStarted: boolean,
): Move | null {
  let bestMove: Move | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestSize = 0;

  const piecesBySize = [...availablePieces]
    .filter((pieceId) => !!PIECE_BY_ID[pieceId])
    .sort((a, b) => PIECE_BY_ID[b].cells.length - PIECE_BY_ID[a].cells.length);

  for (const pieceId of piecesBySize) {
    const piece = PIECE_BY_ID[pieceId];
    if (bestMove && piece.cells.length < bestSize) break;

    for (const orientation of getOrientations(pieceId)) {
      const anchors = candidateAnchors(board, playerId, orientation.shape, hasStarted);
      for (const anchor of anchors) {
        if (!validatePlacement(board, playerId, orientation.shape, anchor, hasStarted).valid) continue;

        const occupied = new Set<string>();
        const frontier = new Set<string>();
        for (const cell of orientation.shape) {
          const x = anchor.x + cell.x;
          const y = anchor.y + cell.y;
          occupied.add(`${x},${y}`);
        }
        for (const cell of orientation.shape) {
          const x = anchor.x + cell.x;
          const y = anchor.y + cell.y;
          for (const direction of diagonalDirections) {
            const nextX = x + direction.x;
            const nextY = y + direction.y;
            if (nextX < 0 || nextY < 0 || nextX >= BOARD_SIZE || nextY >= BOARD_SIZE) continue;
            if (board[boardIndex(nextX, nextY)] === -1 && !occupied.has(`${nextX},${nextY}`)) {
              frontier.add(`${nextX},${nextY}`);
            }
          }
        }

        const width = Math.max(...orientation.shape.map((cell) => cell.x)) + 1;
        const height = Math.max(...orientation.shape.map((cell) => cell.y)) + 1;
        const centerX = anchor.x + width / 2;
        const centerY = anchor.y + height / 2;
        const distanceToCenter = Math.abs(centerX - BOARD_SIZE / 2) + Math.abs(centerY - BOARD_SIZE / 2);
        const score = frontier.size * 3 - distanceToCenter * 0.45 + Math.random() * 2;

        if (score > bestScore) {
          bestSize = orientation.shape.length;
          bestScore = score;
          bestMove = { pieceId, x: anchor.x, y: anchor.y, rotation: orientation.rotation, flipped: orientation.flipped };
        }
      }
    }
  }

  return bestMove;
}

export function findAnyLegalMove(
  board: number[],
  playerId: number,
  availablePieces: string[],
  hasStarted: boolean,
): Move | null {
  for (const pieceId of availablePieces) {
    const moves = findLegalMovesForPiece(board, playerId, pieceId, hasStarted);
    if (moves.length > 0) return moves[0];
  }
  return null;
}