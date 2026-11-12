import { memo, useMemo } from 'react';
import {
  TOTAL_SQUARES_PER_SET,
  computePlayerScores,
  computeStandings,
  computeTeamStandings,
  formatSignedScore,
} from '../engine/index.ts';
import type { ColorPlayerState, GameMode, ScoringRule } from '../engine/index.ts';

type PlayerRailProps = {
  readonly mode: GameMode;
  readonly players: readonly ColorPlayerState[];
  readonly turn: number;
  readonly scoringRule: ScoringRule;
  readonly clocksMs: readonly number[] | null;
  readonly colorblindMode: boolean;
  readonly onToggleAutoplay: (colorId: number) => void;
  readonly onToggleScoringRule: () => void;
};

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const PlayerRail = memo(function PlayerRail({
  mode,
  players,
  turn,
  scoringRule,
  clocksMs,
  colorblindMode,
  onToggleAutoplay,
  onToggleScoringRule,
}: PlayerRailProps) {
  const standings = useMemo(
    () => computeStandings(players, scoringRule),
    [players, scoringRule],
  );
  const leaderIds = useMemo(
    () => new Set(standings.filter((s) => s.isWinner).map((s) => s.id)),
    [standings],
  );
  const teams = useMemo(
    () => (mode === 'tournament_1v1' ? computeTeamStandings(players, scoringRule) : null),
    [mode, players, scoringRule],
  );

  return (
    <aside aria-label="Standings and seats" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Live Standings
        </span>
        <button
          type="button"
          onClick={onToggleScoringRule}
          className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-slate-300 ring-1 ring-white/10 hover:bg-white/10"
          title="Switch between Official (-89..+20) and Squares Placed (+) scoring"
        >
          {scoringRule === 'official' ? 'Official Pts' : 'Squares +'}
        </button>
      </div>

      {teams && (
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/[0.04] p-2.5 ring-1 ring-white/10">
          {teams.map((tm) => (
            <div key={tm.controllerId} className="rounded-lg bg-black/30 px-2.5 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{tm.name}</span>
                <span className="text-xs font-black text-amber-300">
                  {formatSignedScore(tm.displayScore, scoringRule)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                {tm.colors.map((c, idx) => (
                  <span key={idx} className="h-2 w-2 rounded-full" style={{ background: c }} />
                ))}
                <span>{tm.placedSquares} sq placed</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        {players.map((player) => {
          const isTurn = player.id === turn;
          const scores = computePlayerScores(player);
          const display = scoringRule === 'official' ? scores.officialScore : scores.positiveScore;
          const isLeading = player.placedPieces > 0 && leaderIds.has(player.id);
          const clock = clocksMs?.[player.id];
          const lowTime = clock !== undefined && clock > 0 && clock <= 20_000;
          const pct = Math.min(100, Math.round((player.placedSquares / TOTAL_SQUARES_PER_SET) * 100));

          return (
            <div
              key={player.id}
              className={`rounded-2xl p-3 transition ${
                isTurn
                  ? 'bg-white/[0.11] ring-2 ring-amber-400 shadow-lg'
                  : 'bg-[#141f26]/90 ring-1 ring-white/10'
              } ${player.passed ? 'opacity-65' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`h-3.5 w-3.5 shrink-0 rounded-[3px] ${
                      colorblindMode ? `cb-pattern-${player.id % 4}` : ''
                    }`}
                    style={{ backgroundColor: player.color }}
                  />
                  <span className="truncate text-xs font-bold text-white">
                    {player.name}
                    {isLeading && mode !== 'puzzle' ? ' ★' : ''}
                  </span>
                </div>

                <span className="text-sm font-black text-amber-300">
                  {formatSignedScore(display, scoringRule)}
                </span>
              </div>

              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/40">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, backgroundColor: player.color }}
                />
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-400">
                <span>
                  {scores.remainingSquares} sq · {player.available.length} left
                </span>

                <div className="flex items-center gap-1.5">
                  {clock !== undefined && (
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                        lowTime
                          ? 'animate-pulse bg-rose-500/30 text-rose-200'
                          : 'bg-black/35 text-slate-200'
                      }`}
                    >
                      {formatClock(clock)}
                    </span>
                  )}

                  {player.passed ? (
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-300">
                      Passed
                    </span>
                  ) : (
                    player.isHuman &&
                    mode !== 'puzzle' && (
                      <button
                        type="button"
                        onClick={() => onToggleAutoplay(player.id)}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase transition ${
                          player.aiAutoplay
                            ? 'bg-sky-400 text-slate-950'
                            : 'bg-white/8 text-slate-300 hover:bg-white/15'
                        }`}
                        title="Toggle AI Autoplay takeover for this seat"
                      >
                        {player.aiAutoplay ? 'Bot: On' : 'Auto'}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
});
