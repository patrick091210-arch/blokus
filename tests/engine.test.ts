import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPILED_PIECES,
  COMPILED_PIECE_BY_ID,
  PIECES,
  PIECE_GROUPS_DESC,
  TOTAL_SQUARES_PER_SET,
  getNextFlipTransform,
  getNextRotationTransform,
  getShape,
  CLASSIC_START_CORNERS,
  DUO_START_ANCHORS,
  OBSTACLE_CELL,
  EMPTY_CELL,
  applyPlacementToBoard,
  computeCachesFromCells,
  createBoardState,
  createClassicBoard,
  createDuoBoard,
  findAnyLegalMoveOnBoard,
  findLegalMovesForPieceOnBoard,
  hasColorStarted,
  resolveGhostPlacement,
  validatePlacementOnBoard,
  computePlayerScores,
  computeStandings,
  computeTeamStandings,
  computePlayablePieces,
  computeTerritoryMap,
  getCornerHints,
  PUZZLES,
} from '../src/engine/index.ts';
import type { BoardState, ColorPlayerState, Move } from '../src/engine/index.ts';

test('Polyomino piece set has 21 pieces, 89 total squares, and 91 unique orientations', () => {
  assert.equal(PIECES.length, 21);
  const totalSquares = PIECES.reduce((sum, p) => sum + p.size, 0);
  assert.equal(totalSquares, TOTAL_SQUARES_PER_SET);
  assert.equal(totalSquares, 89);

  const totalUniqueOrientations = COMPILED_PIECES.reduce(
    (sum, p) => sum + p.orientations.length,
    0,
  );
  assert.equal(totalUniqueOrientations, 91);

  // Groups 5 -> 1 contain all 21 pieces
  assert.deepEqual(
    PIECE_GROUPS_DESC.map((g) => [g.size, g.pieces.length]),
    [
      [5, 12],
      [4, 5],
      [3, 2],
      [2, 1],
      [1, 1],
    ],
  );

  // Every orientation handle is an occupied cell of that shape
  for (const piece of COMPILED_PIECES) {
    for (const ori of piece.orientations) {
      assert.ok(
        ori.shape.some((c) => c.x === ori.handle.x && c.y === ori.handle.y),
        `Handle of ${piece.id} ori ${ori.index} must be one of its solid cells`,
      );
    }
  }
});

test('Symmetric pieces eliminate redundant rotations and flips', () => {
  for (const symId of ['M', 'O4', 'X']) {
    assert.equal(COMPILED_PIECE_BY_ID[symId].orientations.length, 1);
    assert.equal(getNextRotationTransform(symId, 0, false).changed, false);
    assert.equal(getNextFlipTransform(symId, 0, false).changed, false);
  }

  assert.equal(COMPILED_PIECE_BY_ID['I5'].orientations.length, 2);
  const rotI5 = getNextRotationTransform('I5', 0, false);
  assert.equal(rotI5.changed, true);
  assert.equal(getNextFlipTransform('I5', 0, false).changed, false);

  assert.equal(COMPILED_PIECE_BY_ID['F'].orientations.length, 8);
  assert.equal(getNextRotationTransform('F', 0, false).changed, true);
  assert.equal(getNextFlipTransform('F', 0, false).changed, true);
});

test('Opening anchor, corner-to-corner contact, edge-contact ban, and Duo 14x14 rules', () => {
  let classic = createClassicBoard();
  assert.equal(classic.size, 20);
  assert.deepEqual(CLASSIC_START_CORNERS[0], { x: 0, y: 0 });

  // First move away from (0,0) fails with MISS_START
  const miss = validatePlacementOnBoard(classic, 0, getShape('O4', 0, false), { x: 5, y: 5 }, false);
  assert.equal(miss.valid, false);
  assert.equal(miss.code, 'MISS_START');

  // First move covering (0,0) succeeds
  const okStart = validatePlacementOnBoard(classic, 0, getShape('O4', 0, false), { x: 0, y: 0 }, false);
  assert.equal(okStart.valid, true);
  classic = applyPlacementToBoard(classic, 0, getShape('O4', 0, false), { x: 0, y: 0 }, false);

  // Second move touching edge at (2,0) fails with EDGE_CONTACT
  const edgeHit = validatePlacementOnBoard(classic, 0, getShape('D', 0, false), { x: 2, y: 0 }, true);
  assert.equal(edgeHit.valid, false);
  assert.equal(edgeHit.code, 'EDGE_CONTACT');

  // Disconnected second move at (6,6) fails with NO_CORNER_CONTACT
  const noCorner = validatePlacementOnBoard(classic, 0, getShape('D', 0, false), { x: 6, y: 6 }, true);
  assert.equal(noCorner.valid, false);
  assert.equal(noCorner.code, 'NO_CORNER_CONTACT');

  // Diagonal second move at (2,2) succeeds
  const okDiag = validatePlacementOnBoard(classic, 0, getShape('D', 0, false), { x: 2, y: 2 }, true);
  assert.equal(okDiag.valid, true);

  // Blokus Duo 14x14 starts at inner anchors (4,4) and (9,9), NOT (0,0)
  const duo = createDuoBoard();
  assert.equal(duo.size, 14);
  assert.deepEqual(DUO_START_ANCHORS, [{ x: 4, y: 4 }, { x: 9, y: 9 }]);
  assert.equal(
    validatePlacementOnBoard(duo, 0, getShape('X', 0, false), { x: 0, y: 0 }, false).code,
    'MISS_START',
  );
  // X has cells (1,0),(0,1),(1,1),(2,1),(1,2), so anchor (3,3) covers (4,4)
  assert.equal(
    validatePlacementOnBoard(duo, 0, getShape('X', 0, false), { x: 3, y: 3 }, false).valid,
    true,
  );
});

test('Obstacle cells (-2) block placement and frontier generation', () => {
  const cells = new Array<number>(36).fill(EMPTY_CELL);
  cells[0] = 0; // player 0 at (0,0)
  cells[7] = OBSTACLE_CELL; // obstacle at (1,1), blocking the only diagonal of (0,0)!
  const board = createBoardState({
    size: 6,
    colorCount: 1,
    startAnchors: [{ x: 0, y: 0 }],
    mustCoverStart: true,
    initialCells: cells,
  });
  assert.equal(board.frontierSets[0].length, 0);
  assert.equal(findLegalMovesForPieceOnBoard(board, 0, 'M').length, 0);
});

test('Incremental forbiddenMasks and frontierSets match full-board recomputation across a full 4P game', () => {
  let board = createClassicBoard();
  const hands = [0, 1, 2, 3].map(() => PIECES.map((p) => p.id));
  let turn = 0;
  let consecutivePasses = 0;
  let movesApplied = 0;

  while (consecutivePasses < 4 && movesApplied < 100) {
    const move = findAnyLegalMoveOnBoard(board, turn, hands[turn]);
    if (!move) {
      consecutivePasses += 1;
    } else {
      consecutivePasses = 0;
      const shape = getShape(move.pieceId, move.rotation, move.flipped);
      const startedBefore = hasColorStarted(board, turn);
      const check = validatePlacementOnBoard(
        board,
        turn,
        shape,
        { x: move.x, y: move.y },
        startedBefore,
      );
      assert.equal(check.valid, true, `Move ${JSON.stringify(move)} must be valid`);

      board = applyPlacementToBoard(board, turn, shape, { x: move.x, y: move.y }, startedBefore);
      hands[turn] = hands[turn].filter((id) => id !== move.pieceId);
      movesApplied += 1;

      const fresh = computeCachesFromCells(
        board.size,
        board.colorCount,
        board.startAnchors,
        board.mustCoverStart,
        board.cells,
      );
      for (let c = 0; c < 4; c += 1) {
        assert.deepEqual(
          Array.from(board.forbiddenMasks[c]),
          Array.from(fresh.forbiddenMasks[c]),
          `forbiddenMasks mismatch for color ${c} at move ${movesApplied}`,
        );
        assert.deepEqual(
          board.frontierSets[c],
          fresh.frontierSets[c],
          `frontierSets mismatch for color ${c} at move ${movesApplied}`,
        );
      }

      // Spot-check brute-force move count vs fast anchor move count on move 12
      if (movesApplied === 12) {
        const pieceToTest = 'F';
        const fastMoves = findLegalMovesForPieceOnBoard(board, turn, pieceToTest);
        const startedNow = hasColorStarted(board, turn);
        const bruteMoves: Move[] = [];
        for (const ori of COMPILED_PIECE_BY_ID[pieceToTest].orientations) {
          for (let y = 0; y < board.size; y += 1) {
            for (let x = 0; x < board.size; x += 1) {
              if (validatePlacementOnBoard(board, turn, ori.shape, { x, y }, startedNow).valid) {
                bruteMoves.push({ pieceId: pieceToTest, x, y, rotation: ori.rotation, flipped: ori.flipped });
              }
            }
          }
        }
        assert.equal(fastMoves.length, bruteMoves.length);
      }
    }
    turn = (turn + 1) % 4;
  }

  assert.ok(movesApplied > 40, `Expected full game simulation to place >40 pieces, got ${movesApplied}`);
});

test('Official & positive scoring, +15/+20 clear bonuses, tied ranks, and 1v1 team standings', () => {
  // All cleared with M last => +20 official, 89 + 20 = 109 positive
  const perfect = computePlayerScores({ available: [], placedSquares: 89, lastPiece: 'M' });
  assert.equal(perfect.officialScore, 20);
  assert.equal(perfect.positiveScore, 109);

  // All cleared with D last => +15 official, 89 + 15 = 104 positive
  const clearNonMono = computePlayerScores({ available: [], placedSquares: 89, lastPiece: 'D' });
  assert.equal(clearNonMono.officialScore, 15);
  assert.equal(clearNonMono.positiveScore, 104);

  // Remaining I5 + M (6 squares left) => -6 official, 83 positive
  const partial = computePlayerScores({ available: ['I5', 'M'], placedSquares: 83, lastPiece: 'F' });
  assert.equal(partial.officialScore, -6);
  assert.equal(partial.positiveScore, 83);

  const mockPlayers: ColorPlayerState[] = [
    {
      id: 0,
      name: 'Blue',
      controllerName: 'Player A',
      controllerId: 0,
      color: '#42b6ff',
      isHuman: true,
      aiAutoplay: false,
      available: [],
      placedSquares: 89,
      placedPieces: 21,
      lastPiece: 'M',
      passed: true,
    },
    {
      id: 1,
      name: 'Amber',
      controllerName: 'AI Rival',
      controllerId: 1,
      color: '#ffb447',
      isHuman: false,
      aiAutoplay: false,
      available: ['I5'],
      placedSquares: 84,
      placedPieces: 20,
      lastPiece: 'F',
      passed: true,
    },
    {
      id: 2,
      name: 'Coral',
      controllerName: 'Player A',
      controllerId: 0,
      color: '#ff5c70',
      isHuman: true,
      aiAutoplay: false,
      available: ['P'],
      placedSquares: 84,
      placedPieces: 20,
      lastPiece: 'W',
      passed: true,
    },
    {
      id: 3,
      name: 'Jade',
      controllerName: 'AI Rival',
      controllerId: 1,
      color: '#51d7a4',
      isHuman: false,
      aiAutoplay: false,
      available: ['V5', 'O4'],
      placedSquares: 80,
      placedPieces: 19,
      lastPiece: 'X',
      passed: true,
    },
  ];

  const standings = computeStandings(mockPlayers, 'official');
  // Scores: Blue +20 (rank 1), Amber -5 (rank 2), Coral -5 (rank 2), Jade -9 (rank 4)
  assert.deepEqual(
    standings.map((s) => [s.name, s.displayScore, s.rank, s.isWinner]),
    [
      ['Blue', 20, 1, true],
      ['Amber', -5, 2, false],
      ['Coral', -5, 2, false],
      ['Jade', -9, 4, false],
    ],
  );

  // 1v1 Tournament combined scoring: Player A (Blue +20, Coral -5 => +15) vs AI Rival (Amber -5, Jade -9 => -14)
  const teams = computeTeamStandings(mockPlayers, 'official');
  assert.equal(teams.length, 2);
  assert.equal(teams[0].name, 'Player A');
  assert.equal(teams[0].displayScore, 15);
  assert.equal(teams[0].isWinner, true);
  assert.equal(teams[1].name, 'AI Rival');
  assert.equal(teams[1].displayScore, -14);
});

test('Tactical helpers: playable pieces, corner hints, territory map, and magnetic ghost snap', () => {
  let board = createClassicBoard();
  board = applyPlacementToBoard(board, 0, getShape('O4', 0, false), { x: 0, y: 0 }, false);
  board = applyPlacementToBoard(board, 1, getShape('O4', 0, false), { x: 18, y: 0 }, false);

  const hints = getCornerHints(board, 0);
  assert.deepEqual(hints, [{ x: 2, y: 2 }]);

  const playable = computePlayablePieces(board, 0, ['M', 'I5']);
  assert.equal(playable.has('M'), true);
  assert.equal(playable.has('I5'), true);

  const territory = computeTerritoryMap(board);
  assert.ok(territory.counts[0] > 0);
  assert.ok(territory.counts[1] > 0);

  // Ghost snap: pointer at (1,2) is 1 cell off from legal anchor (2,2) for M -> snaps to (2,2)
  const ghost = resolveGhostPlacement(board, 0, 'M', 0, false, { x: 1, y: 2 }, true, 2);
  assert.equal(ghost.snapped, true);
  assert.deepEqual(ghost.anchor, { x: 2, y: 2 });
  assert.equal(ghost.validation.valid, true);
});

function canSolvePuzzleDFS(board: BoardState, remaining: readonly string[], started: boolean): boolean {
  if (remaining.length === 0) return true;
  for (let i = 0; i < remaining.length; i += 1) {
    const pieceId = remaining[i];
    const moves = findLegalMovesForPieceOnBoard(board, 0, pieceId);
    if (moves.length === 0) continue;
    const nextRemaining = remaining.filter((_, idx) => idx !== i);
    for (const move of moves) {
      const shape = getShape(move.pieceId, move.rotation, move.flipped);
      const nextBoard = applyPlacementToBoard(board, 0, shape, { x: move.x, y: move.y }, started);
      if (canSolvePuzzleDFS(nextBoard, nextRemaining, true)) {
        return true;
      }
    }
  }
  return false;
}

test('All 6 built-in puzzles are verified legally solvable by DFS', () => {
  assert.equal(PUZZLES.length, 6);
  for (const puzzle of PUZZLES) {
    const board = createBoardState({
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
    const started = hasColorStarted(board, 0);
    const solvable = canSolvePuzzleDFS(board, puzzle.availablePieces, started);
    assert.equal(solvable, true, `Puzzle "${puzzle.id}" (${puzzle.title}) must have at least one legal full solution!`);
  }
});
