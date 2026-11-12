import AIWorker from './ai.worker.ts?worker&inline';
import { chooseAIMove } from './evaluator.ts';
import type { AIWorkerRequest, AIWorkerResponse } from './ai.worker.ts';
import type {
  AIDifficulty,
  BoardState,
  ColorPlayerState,
  Move,
} from '../engine/index.ts';

let workerInstance: Worker | null = null;
let workerFailed = false;
let nextRequestId = 1;
const pendingResolvers = new Map<number, (move: Move | null) => void>();

function ensureWorker(): Worker | null {
  if (workerFailed || typeof Worker === 'undefined') return null;
  if (workerInstance) return workerInstance;
  try {
    workerInstance = new AIWorker();
    workerInstance.onmessage = (event: MessageEvent<AIWorkerResponse>) => {
      const { requestId, move } = event.data;
      const resolve = pendingResolvers.get(requestId);
      if (resolve) {
        pendingResolvers.delete(requestId);
        resolve(move);
      }
    };
    workerInstance.onerror = () => {
      workerFailed = true;
      for (const [, resolve] of pendingResolvers) {
        resolve(null);
      }
      pendingResolvers.clear();
      workerInstance?.terminate();
      workerInstance = null;
    };
    return workerInstance;
  } catch {
    workerFailed = true;
    return null;
  }
}

export function requestAIMoveAsync(params: {
  board: BoardState;
  players: readonly ColorPlayerState[];
  turnColorId: number;
  difficulty: AIDifficulty;
  alliedColorIds?: readonly number[];
  maxTimeMs?: number;
}): { promise: Promise<Move | null>; cancel: () => void } {
  const requestId = nextRequestId++;
  let cancelled = false;

  const worker = ensureWorker();
  if (worker) {
    const promise = new Promise<Move | null>((resolve) => {
      pendingResolvers.set(requestId, (move) => {
        if (cancelled) {
          resolve(null);
          return;
        }
        resolve(move);
      });
      const payload: AIWorkerRequest = {
        requestId,
        board: params.board,
        players: params.players,
        turnColorId: params.turnColorId,
        difficulty: params.difficulty,
        alliedColorIds: params.alliedColorIds,
        maxTimeMs: params.maxTimeMs,
      };
      worker.postMessage(payload);
    });

    return {
      promise,
      cancel: () => {
        cancelled = true;
        pendingResolvers.delete(requestId);
      },
    };
  }

  // Fallback to async main-thread scheduling if Web Worker is unavailable
  let timerId: ReturnType<typeof setTimeout> | null = null;
  const promise = new Promise<Move | null>((resolve) => {
    timerId = setTimeout(() => {
      if (cancelled) {
        resolve(null);
        return;
      }
      const move = chooseAIMove(params.board, params.players, params.turnColorId, {
        difficulty: params.difficulty,
        alliedColorIds: params.alliedColorIds,
        maxTimeMs: params.maxTimeMs,
      });
      resolve(move);
    }, 16);
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (timerId !== null) clearTimeout(timerId);
    },
  };
}
