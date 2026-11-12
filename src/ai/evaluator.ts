import {
  DIAGONAL_DIRS,
  EMPTY_CELL,
  ORTHOGONAL_DIRS,
  PIECE_BY_ID,
  PIECES_BY_SIZE_DESC,
  applyPlacementToBoard,
  computePlayablePieces,
  findLegalMovesForPieceOnBoard,
  getShape,
  hasColorStarted,
} from '../engine/index.ts';
import type {
  AIDifficulty,
  BoardState,
  ColorPlayerState,
  Move,
  Point,
} from '../engine/index.ts';

export type AIEvalOptions = {
  readonly difficulty: AIDifficulty;
  readonly alliedColorIds?: readonly number[];
  readonly maxTimeMs?: number;
  readonly rng?: () => number;
};

type ScoredMove = {
  readonly move: Move;
  readonly shape: readonly Point[];
  readonly heuristic: number;
};

function collectAllLegalMoves(
  board: BoardState,
  colorId: number,
  availablePieces: readonly string[],
): Move[] {
  const availSet = new Set(availablePieces);
  const allMoves: Move[] = [];
  for (const piece of PIECES_BY_SIZE_DESC) {
    if (!availSet.has(piece.id)) continue;
    const moves = findLegalMovesForPieceOnBoard(board, colorId, piece.id);
    for (let i = 0; i < moves.length; i += 1) {
      allMoves.push(moves[i]);
    }
  }
  return allMoves;
}

/**
 * Fast O(pieceSize) incremental evaluation of a candidate move without cloning the full board.
 */
function scoreMoveFast(
  board: BoardState,
  colorId: number,
  move: Move,
  availableCount: number,
  placedPiecesCount: number,
  alliedSet: ReadonlySet<number>,
  rng: () => number,
): ScoredMove {
  const shape = getShape(move.pieceId, move.rotation, move.flipped);
  const pieceSize = shape.length;
  const { size, cells, forbiddenMasks } = board;
  const ownMask = forbiddenMasks[colorId];

  // Track placed indices & newly forbidden orthogonal cells for own color
  const placedIndices = new Set<number>();
  const newlyForbiddenOwn = new Set<number>();

  let centerScore = 0;
  const center = (size - 1) / 2;
  const maxCenterDist = center * 2;

  for (let i = 0; i < pieceSize; i += 1) {
    const px = move.x + shape[i].x;
    const py = move.y + shape[i].y;
    const idx = py * size + px;
    placedIndices.add(idx);
    newlyForbiddenOwn.add(idx);

    const distToCenter = Math.abs(px - center) + Math.abs(py - center);
    centerScore += (maxCenterDist - distToCenter) / maxCenterDist;

    for (let d = 0; d < ORTHOGONAL_DIRS.length; d += 1) {
      const nx = px + ORTHOGONAL_DIRS[d].x;
      const ny = py + ORTHOGONAL_DIRS[d].y;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
        newlyForbiddenOwn.add(ny * size + nx);
      }
    }
  }

  // Count how many existing own frontier corners get consumed or self-blocked
  const existingOwnFrontier = board.frontierSets[colorId] ?? [];
  let lostOwnCorners = 0;
  const existingOwnFrontierSet = new Set<number>();
  for (let i = 0; i < existingOwnFrontier.length; i += 1) {
    const fIdx = existingOwnFrontier[i];
    existingOwnFrontierSet.add(fIdx);
    if (newlyForbiddenOwn.has(fIdx)) {
      lostOwnCorners += 1;
    }
  }

  // Count genuinely new valid expansion corners unlocked by this piece
  const gainedOwnCorners = new Set<number>();
  for (let i = 0; i < pieceSize; i += 1) {
    const px = move.x + shape[i].x;
    const py = move.y + shape[i].y;
    for (let d = 0; d < DIAGONAL_DIRS.length; d += 1) {
      const nx = px + DIAGONAL_DIRS[d].x;
      const ny = py + DIAGONAL_DIRS[d].y;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const dIdx = ny * size + nx;
      if (
        cells[dIdx] === EMPTY_CELL &&
        ownMask[dIdx] === 0 &&
        !newlyForbiddenOwn.has(dIdx) &&
        !existingOwnFrontierSet.has(dIdx)
      ) {
        gainedOwnCorners.add(dIdx);
      }
    }
  }

  // Count opponent frontier anchors destroyed (and allied anchors harmed in 1v1 4-color mode)
  let blockedOpponentCorners = 0;
  let harmedAlliedCorners = 0;
  for (let c = 0; c < board.colorCount; c += 1) {
    if (c === colorId) continue;
    const cFrontier = board.frontierSets[c] ?? [];
    let hits = 0;
    for (let i = 0; i < cFrontier.length; i += 1) {
      if (placedIndices.has(cFrontier[i])) {
        hits += 1;
      }
    }
    if (alliedSet.has(c)) {
      harmedAlliedCorners += hits;
    } else {
      blockedOpponentCorners += hits;
    }
  }

  // Strategic bonus: preserve monomino 'M' for the final +5 bonus instead of wasting it early
  let endgameBonus = 0;
  if (availableCount === 1) {
    endgameBonus += 15 + (move.pieceId === 'M' ? 5 : 0);
  } else if (move.pieceId === 'M' && availableCount > 2) {
    endgameBonus -= 7.5;
  }

  const centerWeight = placedPiecesCount < 6 ? 2.4 : placedPiecesCount < 12 ? 0.9 : 0.25;
  const netOwnCorners = gainedOwnCorners.size - lostOwnCorners * 0.65;

  const heuristic =
    pieceSize * 5.4 +
    netOwnCorners * 3.1 +
    blockedOpponentCorners * 2.85 -
    harmedAlliedCorners * 2.5 +
    (centerScore / pieceSize) * centerWeight * 3.0 +
    endgameBonus +
    rng() * 0.18;

  return { move, shape, heuristic };
}

/**
 * Bounded DFS solver for endgames (<= 4 pieces left): finds a move that maximizes
 * total achievable score (squares placed + 15 clear bonus + 5 monomino-last bonus).
 */
function solveSoloEndgameBestMove(
  board: BoardState,
  colorId: number,
  availablePieces: readonly string[],
  deadlineMs: number,
): Move | null {
  let nodes = 0;
  const maxNodes = 1200;

  function dfsMaxPoints(
    curBoard: BoardState,
    remaining: readonly string[],
    started: boolean,
    lastPieceId: string | null,
  ): number {
    if (remaining.length === 0) {
      return 15 + (lastPieceId === 'M' ? 5 : 0);
    }
    if (nodes >= maxNodes || performance.now() >= deadlineMs) {
      return 0;
    }

    let bestSub = 0;
    let anyMove = false;
    // Try larger pieces first, keeping 'M' last so it earns +5 on full clear
    const ordered = [...remaining].sort((a, b) => {
      if (a === 'M') return 1;
      if (b === 'M') return -1;
      return (PIECE_BY_ID[b]?.size ?? 0) - (PIECE_BY_ID[a]?.size ?? 0);
    });

    for (let i = 0; i < ordered.length; i += 1) {
      const pid = ordered[i];
      const pSize = PIECE_BY_ID[pid]?.size ?? 0;
      const moves = findLegalMovesForPieceOnBoard(curBoard, colorId, pid);
      if (moves.length === 0) continue;
      anyMove = true;
      const nextRem = ordered.filter((id) => id !== pid);
      // Cap branching per piece in DFS so wide pockets don't explode
      const limit = Math.min(moves.length, 10);
      for (let m = 0; m < limit; m += 1) {
        nodes += 1;
        if (nodes >= maxNodes || performance.now() >= deadlineMs) break;
        const mv = moves[m];
        const shape = getShape(mv.pieceId, mv.rotation, mv.flipped);
        const nextBoard = applyPlacementToBoard(curBoard, colorId, shape, { x: mv.x, y: mv.y }, started);
        const val = pSize + dfsMaxPoints(nextBoard, nextRem, true, pid);
        if (val > bestSub) bestSub = val;
        // Early exit if theoretical maximum (+20 perfect clear) is achieved
        const maxPossibleRem = nextRem.reduce((s, id) => s + (PIECE_BY_ID[id]?.size ?? 0), 0) + 20;
        if (bestSub >= pSize + maxPossibleRem) return bestSub;
      }
    }
    return anyMove ? bestSub : 0;
  }

  const started = hasColorStarted(board, colorId);
  let bestMove: Move | null = null;
  let bestScore = -Infinity;

  const orderedTop = [...availablePieces].sort((a, b) => {
    if (a === 'M' && availablePieces.length > 1) return 1;
    if (b === 'M' && availablePieces.length > 1) return -1;
    return (PIECE_BY_ID[b]?.size ?? 0) - (PIECE_BY_ID[a]?.size ?? 0);
  });

  for (const pid of orderedTop) {
    const pSize = PIECE_BY_ID[pid]?.size ?? 0;
    const moves = findLegalMovesForPieceOnBoard(board, colorId, pid);
    if (moves.length === 0) continue;
    const nextRem = availablePieces.filter((id) => id !== pid);
    const limit = Math.min(moves.length, 16);
    for (let m = 0; m < limit; m += 1) {
      if (nodes >= maxNodes || performance.now() >= deadlineMs) break;
      const mv = moves[m];
      const shape = getShape(mv.pieceId, mv.rotation, mv.flipped);
      const nextBoard = applyPlacementToBoard(board, colorId, shape, { x: mv.x, y: mv.y }, started);
      const totalVal = pSize + dfsMaxPoints(nextBoard, nextRem, true, pid);
      if (totalVal > bestScore) {
        bestScore = totalVal;
        bestMove = mv;
      }
    }
  }

  return bestMove;
}

export function chooseAIMove(
  board: BoardState,
  players: readonly ColorPlayerState[],
  turnColorId: number,
  options: AIEvalOptions,
): Move | null {
  const player = players[turnColorId];
  if (!player || player.available.length === 0) return null;

  const rng = options.rng ?? Math.random;
  const allMoves = collectAllLegalMoves(board, turnColorId, player.available);
  if (allMoves.length === 0) return null;
  if (allMoves.length === 1) return allMoves[0];

  // 1. EASY: Weighted random favoring larger pieces, no positional blocking
  if (options.difficulty === 'easy') {
    const weights = allMoves.map((mv) => {
      const sz = PIECE_BY_ID[mv.pieceId]?.size ?? 1;
      return sz * sz;
    });
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let pick = rng() * totalWeight;
    for (let i = 0; i < allMoves.length; i += 1) {
      pick -= weights[i];
      if (pick <= 0) return allMoves[i];
    }
    return allMoves[allMoves.length - 1];
  }

  const alliedSet = new Set<number>(options.alliedColorIds ?? []);
  const scored = allMoves.map((mv) =>
    scoreMoveFast(
      board,
      turnColorId,
      mv,
      player.available.length,
      player.placedPieces,
      alliedSet,
      rng,
    ),
  );
  scored.sort((a, b) => b.heuristic - a.heuristic);

  // 2. MEDIUM: Top tactical heuristic (true corner delta + opponent corner denial + center control)
  if (options.difficulty === 'medium') {
    return scored[0].move;
  }

  // 3. HARD: Exact endgame solver when <= 4 pieces remain + 2-ply beam lookahead & mobility evaluation
  const maxTimeMs = options.maxTimeMs ?? 260;
  const deadline = performance.now() + maxTimeMs;

  if (player.available.length <= 4) {
    const solved = solveSoloEndgameBestMove(board, turnColorId, player.available, deadline);
    if (solved) return solved;
  }

  const startedBefore = hasColorStarted(board, turnColorId);
  const beamWidth = Math.min(scored.length, 10);

  // Find next active opponent in turn order
  let nextOppId = -1;
  for (let offset = 1; offset < board.colorCount; offset += 1) {
    const cid = (turnColorId + offset) % board.colorCount;
    if (!alliedSet.has(cid) && players[cid] && !players[cid].passed && players[cid].available.length > 0) {
      nextOppId = cid;
      break;
    }
  }

  let bestCandidate = scored[0].move;
  let bestCombinedScore = -Infinity;

  for (let i = 0; i < beamWidth; i += 1) {
    if (i > 0 && performance.now() >= deadline) break;
    const cand = scored[i];
    const nextBoard = applyPlacementToBoard(
      board,
      turnColorId,
      cand.shape,
      { x: cand.move.x, y: cand.move.y },
      startedBefore,
    );
    const remainingOwn = player.available.filter((id) => id !== cand.move.pieceId);

    // Evaluate post-move own piece playability (avoid self-entombing pentominoes!)
    const ownPlayableCount = computePlayablePieces(nextBoard, turnColorId, remainingOwn).size;
    const ownFrontierCount = nextBoard.frontierSets[turnColorId]?.length ?? 0;

    // 2-ply opponent strongest tactical reply penalty
    let oppBestReply = 0;
    if (nextOppId !== -1 && performance.now() < deadline) {
      const oppPlayer = players[nextOppId];
      const oppMoves = collectAllLegalMoves(nextBoard, nextOppId, oppPlayer.available);
      if (oppMoves.length > 0) {
        // Sample opponent's largest-piece moves (first 24 moves since collectAllLegalMoves is size-desc)
        const sampleLen = Math.min(oppMoves.length, 24);
        const oppAllies = new Set<number>();
        for (let m = 0; m < sampleLen; m += 1) {
          const oppEval = scoreMoveFast(
            nextBoard,
            nextOppId,
            oppMoves[m],
            oppPlayer.available.length,
            oppPlayer.placedPieces,
            oppAllies,
            () => 0,
          );
          if (oppEval.heuristic > oppBestReply) {
            oppBestReply = oppEval.heuristic;
          }
        }
      } else {
        // Completely shutting out the next opponent is huge!
        oppBestReply = -18;
      }
    }

    const combined =
      cand.heuristic * 1.0 +
      ownPlayableCount * 1.85 +
      ownFrontierCount * 0.75 -
      oppBestReply * 0.42;

    if (combined > bestCombinedScore) {
      bestCombinedScore = combined;
      bestCandidate = cand.move;
    }
  }

  return bestCandidate;
}
