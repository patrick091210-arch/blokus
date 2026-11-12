import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIECES,
  PLAYER_COLORS,
  PLAYER_NAMES,
  PUZZLE_BY_ID,
  applyPlacementToBoard,
  computePlayerScores,
  createBoardState,
  createClassicBoard,
  createDuoBoard,
  getShape,
  hasColorStarted,
  validatePlacementOnBoard,
} from '../src/engine/index.ts';
import type { AIDifficulty, ColorPlayerState } from '../src/engine/index.ts';
import { chooseAIMove } from '../src/ai/evaluator.ts';

function makeTestPlayers(count: number): ColorPlayerState[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    name: PLAYER_NAMES[id] ?? `P${id}`,
    controllerName: PLAYER_NAMES[id] ?? `P${id}`,
    controllerId: id,
    color: PLAYER_COLORS[id] ?? '#fff',
    isHuman: false,
    aiAutoplay: true,
    available: PIECES.map((p) => p.id),
    placedSquares: 0,
    placedPieces: 0,
    lastPiece: null,
    passed: false,
  }));
}

test('AI produces valid moves across Easy, Medium, and Hard on Classic 20x20 and Duo 14x14', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as AIDifficulty[]) {
    const classic = createClassicBoard();
    const players4 = makeTestPlayers(4);
    const mv4 = chooseAIMove(classic, players4, 0, { difficulty, maxTimeMs: 120 });
    assert.ok(mv4, `Expected move for ${difficulty} on Classic`);
    assert.equal(
      validatePlacementOnBoard(classic, 0, getShape(mv4.pieceId, mv4.rotation, mv4.flipped), { x: mv4.x, y: mv4.y }, false).valid,
      true,
    );

    const duo = createDuoBoard();
    const players2 = makeTestPlayers(2);
    const mv2 = chooseAIMove(duo, players2, 1, { difficulty, maxTimeMs: 120 });
    assert.ok(mv2, `Expected move for ${difficulty} on Duo`);
    assert.equal(
      validatePlacementOnBoard(duo, 1, getShape(mv2.pieceId, mv2.rotation, mv2.flipped), { x: mv2.x, y: mv2.y }, false).valid,
      true,
    );
  }
});

test('Hard AI endgame solver clears tight 3-piece puzzle and saves M for the +5 bonus', () => {
  const puzzle = PUZZLE_BY_ID['twin-bridges'];
  let board = createBoardState({
    size: puzzle.boardSize,
    colorCount: 4,
    startAnchors: [
      puzzle.startAnchor,
      { x: puzzle.boardSize - 1, y: 0 },
      { x: puzzle.boardSize - 1, y: puzzle.boardSize - 1 },
      { x: 0, y: puzzle.boardSize - 1 },
    ],
    mustCoverStart: puzzle.mustCoverStart,
    initialCells: puzzle.initialCells,
  });

  const players = makeTestPlayers(4);
  players[0] = {
    ...players[0],
    available: [...puzzle.availablePieces],
    placedPieces: 18,
    placedSquares: 81,
  };

  const sequence: string[] = [];
  for (let step = 0; step < 3; step += 1) {
    const mv = chooseAIMove(board, players, 0, { difficulty: 'hard', maxTimeMs: 200 });
    assert.ok(mv, `Hard AI should find move at step ${step}`);
    const shape = getShape(mv.pieceId, mv.rotation, mv.flipped);
    const started = hasColorStarted(board, 0);
    assert.equal(validatePlacementOnBoard(board, 0, shape, { x: mv.x, y: mv.y }, started).valid, true);
    board = applyPlacementToBoard(board, 0, shape, { x: mv.x, y: mv.y }, started);
    sequence.push(mv.pieceId);
    players[0] = {
      ...players[0],
      available: players[0].available.filter((id) => id !== mv.pieceId),
      placedPieces: players[0].placedPieces + 1,
      placedSquares: players[0].placedSquares + shape.length,
      lastPiece: mv.pieceId,
    };
  }

  assert.equal(players[0].available.length, 0);
  assert.equal(sequence[sequence.length - 1], 'M', 'Hard AI should finish with M for +20 clear bonus');
});

test('Tactical/Hard AI outperforms Easy AI in a full 4-player match', () => {
  let board = createClassicBoard();
  const players = makeTestPlayers(4);
  const difficulties: AIDifficulty[] = ['hard', 'easy', 'medium', 'easy'];

  // Deterministic PRNG for reproducible test
  let seed = 42;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  let consecutivePasses = 0;
  let turn = 0;

  while (consecutivePasses < 4) {
    const mv = chooseAIMove(board, players, turn, {
      difficulty: difficulties[turn],
      maxTimeMs: 35,
      rng,
    });

    if (!mv) {
      players[turn] = { ...players[turn], passed: true };
      consecutivePasses += 1;
    } else {
      consecutivePasses = 0;
      const shape = getShape(mv.pieceId, mv.rotation, mv.flipped);
      const started = hasColorStarted(board, turn);
      assert.equal(
        validatePlacementOnBoard(board, turn, shape, { x: mv.x, y: mv.y }, started).valid,
        true,
      );
      board = applyPlacementToBoard(board, turn, shape, { x: mv.x, y: mv.y }, started);
      players[turn] = {
        ...players[turn],
        available: players[turn].available.filter((id) => id !== mv.pieceId),
        placedSquares: players[turn].placedSquares + shape.length,
        placedPieces: players[turn].placedPieces + 1,
        lastPiece: mv.pieceId,
        passed: false,
      };
    }
    turn = (turn + 1) % 4;
  }

  const scores = players.map((p) => computePlayerScores(p).officialScore);
  const strongTotal = scores[0] + scores[2]; // Hard + Medium
  const easyTotal = scores[1] + scores[3]; // Easy + Easy
  assert.ok(
    strongTotal > easyTotal,
    `Expected Hard+Medium (${strongTotal}) to beat Easy+Easy (${easyTotal}), scores=${JSON.stringify(scores)}`,
  );
});
