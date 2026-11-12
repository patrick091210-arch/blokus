import { useEffect, useState } from 'react';
import {
  PUZZLES,
  computeStandings,
  computeTeamStandings,
  formatSignedScore,
} from '../engine/index.ts';
import { exportMatchCode } from '../state/storage.ts';
import type { MatchState } from '../state/matchTypes.ts';

export function ReplayControlBar({
  totalSteps,
  currentStep,
  onStep,
  onExit,
}: {
  readonly totalSteps: number;
  readonly currentStep: number;
  readonly onStep: (targetIndex: number) => void;
  readonly onExit: () => void;
}) {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    if (currentStep >= totalSteps) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => {
      onStep(currentStep + 1);
    }, 420);
    return () => window.clearTimeout(id);
  }, [currentStep, onStep, playing, totalSteps]);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sky-950/70 px-4 py-3 ring-1 ring-sky-400/40">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            onStep(0);
          }}
          className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-white/20"
        >
          |◀
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            onStep(currentStep - 1);
          }}
          disabled={currentStep <= 0}
          className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-35"
        >
          ◀
        </button>
        <button
          type="button"
          onClick={() => {
            if (currentStep >= totalSteps) onStep(0);
            setPlaying((p) => !p);
          }}
          className="rounded-lg bg-sky-400 px-3.5 py-1.5 text-xs font-black text-slate-950 hover:bg-sky-300"
        >
          {playing ? '❚❚ Pause' : '▶ Auto'}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            onStep(currentStep + 1);
          }}
          disabled={currentStep >= totalSteps}
          className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-35"
        >
          ▶
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            onStep(totalSteps);
          }}
          className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-white/20"
        >
          ▶|
        </button>
      </div>

      <div className="flex min-w-[180px] flex-1 items-center gap-3">
        <input
          type="range"
          min={0}
          max={totalSteps}
          value={currentStep}
          onChange={(e) => {
            setPlaying(false);
            onStep(Number(e.target.value));
          }}
          className="w-full accent-sky-400"
        />
        <span className="font-mono text-xs font-bold text-sky-200 whitespace-nowrap">
          {currentStep}/{totalSteps}
        </span>
      </div>

      <button
        type="button"
        onClick={onExit}
        className="rounded-xl bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white ring-1 ring-white/15 hover:bg-white/20"
      >
        Done
      </button>
    </div>
  );
}

export function MatchModalOverlays({
  state,
  onReadyHandoff,
  onResume,
  onRestart,
  onUndo,
  onEnterReplay,
  onNextPuzzle,
  onExitMenu,
}: {
  readonly state: MatchState;
  readonly onReadyHandoff: () => void;
  readonly onResume: () => void;
  readonly onRestart: () => void;
  readonly onUndo: () => void;
  readonly onEnterReplay: () => void;
  readonly onNextPuzzle: (puzzleId: string) => void;
  readonly onExitMenu: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyShareCode = async () => {
    const code = exportMatchCode(state.config, state.history);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy your BLKS1 match code:', code);
    }
  };

  if (state.phase === 'playing' && state.handoff) {
    const nextSeat = state.players[state.turn];
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-[#152128] p-6 text-center shadow-2xl ring-1 ring-white/15">
          <div
            className="mx-auto mb-3 h-4 w-16 rounded-full"
            style={{ backgroundColor: nextSeat?.color ?? '#42b6ff' }}
          />
          <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Pass Device / Next Turn
          </div>
          <h2 className="mt-1 text-2xl font-black text-white">{nextSeat?.name ?? 'Next Player'}</h2>
          {state.skippedNotice && (
            <div className="mt-3 rounded-xl bg-amber-400/15 px-3 py-2 text-xs font-semibold text-amber-200 ring-1 ring-amber-400/30">
              {state.skippedNotice}
            </div>
          )}
          <p className="mt-2 text-xs text-slate-400">
            {nextSeat?.available.length ?? 0} pieces remaining. Ready to claim corners?
          </p>
          <button
            type="button"
            onClick={onReadyHandoff}
            className="mt-5 w-full rounded-xl bg-amber-400 py-3 text-sm font-black uppercase tracking-wider text-slate-950 hover:bg-amber-300"
          >
            Ready — Start Turn
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === 'paused') {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-[#152128] p-6 shadow-2xl ring-1 ring-white/15">
          <div className="text-xs font-bold uppercase tracking-widest text-amber-300">Match Paused</div>
          <h2 className="mt-1 text-2xl font-black text-white">Tactical Briefing</h2>
          <ul className="mt-3 space-y-1.5 text-xs text-slate-300">
            <li>• First piece must cover your starting anchor.</li>
            <li>• Same-color pieces must touch corner-to-corner — never share an edge.</li>
            <li>• Clear all 21 pieces for +15 pts (+5 extra if Monomino M is placed last).</li>
          </ul>

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onResume}
              className="col-span-2 rounded-xl bg-amber-400 py-2.5 text-sm font-black uppercase tracking-wider text-slate-950 hover:bg-amber-300"
            >
              Resume Match
            </button>
            <button
              type="button"
              onClick={() => void copyShareCode()}
              className="rounded-xl bg-sky-500/20 py-2.5 text-xs font-bold text-sky-200 ring-1 ring-sky-400/30 hover:bg-sky-500/30"
            >
              {copied ? '✓ Code Copied!' : 'Copy Share Code'}
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="rounded-xl bg-white/10 py-2.5 text-xs font-bold text-white hover:bg-white/15"
            >
              Restart
            </button>
            <button
              type="button"
              onClick={onExitMenu}
              className="col-span-2 rounded-xl bg-white/5 py-2.5 text-xs font-semibold text-slate-300 ring-1 ring-white/10 hover:bg-white/10"
            >
              Exit to Main Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.phase === 'gameover') {
    if (state.config.mode === 'puzzle') {
      const curIdx = PUZZLES.findIndex((p) => p.id === state.config.puzzleId);
      const nextPz = PUZZLES[(curIdx + 1) % PUZZLES.length];
      return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-[#152128] p-6 text-center shadow-2xl ring-1 ring-white/15">
            <div className="text-xs font-bold uppercase tracking-widest text-sky-300">
              {state.puzzleSolved ? 'Challenge Cleared ★' : 'Pocket Deadlock'}
            </div>
            <h2 className="mt-1 text-2xl font-black text-white">
              {state.puzzleSolved ? 'Masterful Geometry!' : 'Out of Legal Corners'}
            </h2>
            <p className="mt-2 text-xs text-slate-300">{state.message}</p>

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {state.puzzleSolved ? (
                <button
                  type="button"
                  onClick={() => onNextPuzzle(nextPz.id)}
                  className="col-span-2 rounded-xl bg-emerald-400 py-2.5 text-sm font-black uppercase tracking-wider text-slate-950 hover:bg-emerald-300"
                >
                  Next Puzzle: {nextPz.title}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onUndo}
                  className="col-span-2 rounded-xl bg-amber-400 py-2.5 text-sm font-black uppercase tracking-wider text-slate-950 hover:bg-amber-300"
                >
                  ↶ Undo Last Move
                </button>
              )}
              <button
                type="button"
                onClick={onEnterReplay}
                className="rounded-xl bg-sky-500/20 py-2.5 text-xs font-bold text-sky-200 ring-1 ring-sky-400/30"
              >
                Inspect Board
              </button>
              <button
                type="button"
                onClick={onRestart}
                className="rounded-xl bg-white/10 py-2.5 text-xs font-bold text-white"
              >
                Retry Puzzle
              </button>
              <button
                type="button"
                onClick={onExitMenu}
                className="col-span-2 rounded-xl bg-white/5 py-2 text-xs text-slate-300 ring-1 ring-white/10"
              >
                Main Menu
              </button>
            </div>
          </div>
        </div>
      );
    }

    const rule = state.config.scoringRule;
    const standings = computeStandings(state.players, rule);
    const teams =
      state.config.mode === 'tournament_1v1' ? computeTeamStandings(state.players, rule) : null;
    const winners = teams ? teams.filter((t) => t.isWinner) : standings.filter((s) => s.isWinner);
    const isTie = winners.length > 1;
    const headline = isTie
      ? `Tie at the Summit (${winners.map((w) => w.name).join(' & ')})`
      : `${winners[0]?.name ?? 'Player'} Claims Victory!`;

    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-2xl bg-[#152128] p-6 shadow-2xl ring-1 ring-white/15">
          <div className="text-xs font-bold uppercase tracking-widest text-amber-300">
            Final Standings · {rule === 'official' ? 'Official Scoring' : 'Squares Placed'}
          </div>
          <h2 className="mt-1 text-2xl font-black text-white">{headline}</h2>

          {teams && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {teams.map((tm) => (
                <div
                  key={tm.controllerId}
                  className={`rounded-xl p-3 ${
                    tm.isWinner ? 'bg-amber-400/15 ring-1 ring-amber-400/50' : 'bg-black/30 ring-1 ring-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold text-white">
                    <span>#{tm.rank} {tm.name}</span>
                    <span className="text-sm font-black text-amber-300">
                      {formatSignedScore(tm.displayScore, rule)}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {tm.placedSquares}/178 squares placed
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 space-y-2">
            {standings.map((entry) => (
              <div
                key={entry.id}
                className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 ${
                  entry.isWinner && !teams
                    ? 'bg-amber-400/15 ring-1 ring-amber-400/50'
                    : 'bg-black/30 ring-1 ring-white/8'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-6 text-xs font-black text-slate-400">#{entry.rank}</span>
                  <span className="h-3 w-3 rounded-[2px]" style={{ background: entry.color }} />
                  <div>
                    <div className="text-xs font-bold text-white">{entry.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {entry.placedSquares} placed · {entry.remainingSquares} left
                    </div>
                  </div>
                </div>
                <div className="text-base font-black text-amber-300">
                  {formatSignedScore(entry.displayScore, rule)}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onRestart}
              className="rounded-xl bg-amber-400 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-amber-300"
            >
              Play Again
            </button>
            <button
              type="button"
              onClick={onEnterReplay}
              className="rounded-xl bg-sky-400 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-sky-300"
            >
              ⏱ Time-Machine Replay
            </button>
            <button
              type="button"
              onClick={() => void copyShareCode()}
              className="rounded-xl bg-white/10 py-2.5 text-xs font-bold text-white hover:bg-white/15"
            >
              {copied ? '✓ Match Code Copied!' : 'Share Match Code'}
            </button>
            <button
              type="button"
              onClick={onExitMenu}
              className="rounded-xl bg-white/5 py-2.5 text-xs font-semibold text-slate-300 ring-1 ring-white/10 hover:bg-white/10"
            >
              Main Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
