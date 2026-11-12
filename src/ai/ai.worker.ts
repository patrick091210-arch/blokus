import { chooseAIMove } from './evaluator.ts';
import type {
  AIDifficulty,
  BoardState,
  ColorPlayerState,
  Move,
} from '../engine/index.ts';

export type AIWorkerRequest = {
  readonly requestId: number;
  readonly board: BoardState;
  readonly players: readonly ColorPlayerState[];
  readonly turnColorId: number;
  readonly difficulty: AIDifficulty;
  readonly alliedColorIds?: readonly number[];
  readonly maxTimeMs?: number;
};

export type AIWorkerResponse = {
  readonly requestId: number;
  readonly move: Move | null;
};

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<AIWorkerRequest>) => void) | null;
  postMessage: (message: AIWorkerResponse) => void;
};

ctx.onmessage = (event: MessageEvent<AIWorkerRequest>) => {
  const { requestId, board, players, turnColorId, difficulty, alliedColorIds, maxTimeMs } = event.data;
  const move = chooseAIMove(board, players, turnColorId, {
    difficulty,
    alliedColorIds,
    maxTimeMs,
  });
  ctx.postMessage({ requestId, move });
};
