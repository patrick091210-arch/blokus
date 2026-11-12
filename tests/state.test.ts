import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseAIMove } from '../src/ai/evaluator.ts';
import {
  DEFAULT_SETUP_CONFIG,
  matchReducer,
  startNewMatchState,
} from '../src/state/matchState.ts';
import { getAlliedColorIds } from '../src/state/matchTypes.ts';
import { exportMatchCode, importMatchCode } from '../src/state/storage.ts';

test('All 6 modes initialize with expected board dimensions and human/AI seats', () => {
  const solo = startNewMatchState({ ...DEFAULT_SETUP_CONFIG, mode: 'solo' });
  assert.equal(solo.board.size, 20);
  assert.deepEqual(solo.players.map((p) => p.isHuman), [true, false, false, false]);

  const duoCoop = startNewMatchState({ ...DEFAULT_SETUP_CONFIG, mode: 'duo_coop' });
  assert.equal(duoCoop.board.size, 20);
  assert.deepEqual(duoCoop.players.map((p) => p.isHuman), [true, false, true, false]);

  const tourney = startNewMatchState({ ...DEFAULT_SETUP_CONFIG, mode: 'tournament_1v1', opponentType: 'ai' });
  assert.equal(tourney.board.size, 20);
  assert.deepEqual(tourney.players.map((p) => p.controllerId), [0, 1, 0, 1]);
  assert.deepEqual(getAlliedColorIds('tournament_1v1', 0), [0, 2]);
  assert.deepEqual(getAlliedColorIds('tournament_1v1', 1), [1, 3]);

  const duo14 = startNewMatchState({ ...DEFAULT_SETUP_CONFIG, mode: 'blokus_duo', opponentType: 'human' });
  assert.equal(duo14.board.size, 14);
  assert.equal(duo14.players.length, 2);
  assert.deepEqual(duo14.players.map((p) => p.isHuman), [true, true]);

  const puzzle = startNewMatchState({
    ...DEFAULT_SETUP_CONFIG,
    mode: 'puzzle',
    puzzleId: 'corner-thread',
  });
  assert.equal(puzzle.board.size, 8);
  assert.deepEqual(puzzle.players[0].available, ['V3', 'L4']);
});

test('Undo & Redo rewind across AI turns back to human seat and replay steps accurately', () => {
  let state = startNewMatchState({ ...DEFAULT_SETUP_CONFIG, mode: 'solo' });

  // Human plays opening move via CONFIRM_CURSOR_PLACE
  state = matchReducer(state, { type: 'CONFIRM_CURSOR_PLACE', snap: true });
  assert.equal(state.movesPlayed, 1);
  assert.equal(state.turn, 1);

  // 3 AI seats respond
  for (const aiSeat of [1, 2, 3]) {
    const aiMove = chooseAIMove(state.board, state.players, aiSeat, { difficulty: 'medium' });
    assert.ok(aiMove);
    state = matchReducer(state, {
      type: 'AI_MOVE_RESOLVED',
      sessionId: state.sessionId,
      colorId: aiSeat,
      move: aiMove,
    });
  }
  assert.equal(state.movesPlayed, 4);
  assert.equal(state.turn, 0);

  // Undo rewinds all 3 AI moves + human's move back to move 0 (human turn 0!)
  const undone = matchReducer(state, { type: 'UNDO' });
  assert.equal(undone.movesPlayed, 0);
  assert.equal(undone.turn, 0);
  assert.equal(undone.players[0].available.length, 21);

  // Redo steps forward cleanly
  const redone = matchReducer(undone, { type: 'REDO' });
  assert.equal(redone.movesPlayed, 4);
  assert.equal(redone.turn, 0);

  // Replay mode inspects step 2
  let replay = matchReducer(redone, { type: 'REPLAY_ENTER' });
  assert.equal(replay.phase, 'replay');
  replay = matchReducer(replay, { type: 'REPLAY_STEP', targetIndex: 2 });
  assert.equal(replay.movesPlayed, 2);
  const exited = matchReducer(replay, { type: 'REPLAY_EXIT' });
  assert.equal(exited.phase, 'playing');
  assert.equal(exited.movesPlayed, 4);
});

test('Blitz clock increments on placement and flags seat on timeout, and Base64URL share code round-trips', () => {
  let state = startNewMatchState({
    ...DEFAULT_SETUP_CONFIG,
    mode: 'blokus_duo',
    opponentType: 'human',
    clockPreset: 'blitz_3m',
  });
  assert.deepEqual(state.clocksMs, [180_000, 180_000]);

  state = matchReducer(state, { type: 'TICK_CLOCK', elapsedMs: 10_000 });
  assert.equal(state.clocksMs?.[0], 170_000);

  // Player 1 places opening move -> receives +3s Fisher increment (173_000 ms) and seamlessly passes turn to Player 2
  state = matchReducer(state, { type: 'CONFIRM_CURSOR_PLACE', snap: true });
  assert.equal(state.clocksMs?.[0], 173_000);
  assert.equal(state.turn, 1);
  assert.equal(state.handoff, false);

  // Player 2 flags on time -> marked passed, returns turn to Player 1
  state = matchReducer(state, { type: 'TICK_CLOCK', elapsedMs: 185_000 });
  assert.equal(state.players[1].passed, true);
  assert.equal(state.turn, 0);

  // Export & import Base64URL match code
  const code = exportMatchCode(state.config, state.history);
  assert.ok(code.startsWith('BLKS1-'));
  const decoded = importMatchCode(code);
  assert.ok(decoded);
  assert.deepEqual(decoded.config, state.config);
  assert.deepEqual(decoded.history, state.history);
});
