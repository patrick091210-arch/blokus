import { useState } from 'react';
import { PLAYER_COLORS, PUZZLES } from '../engine/index.ts';
import type { AIDifficulty, GameMode, ScoringRule } from '../engine/index.ts';
import type {
  ClockPreset,
  MatchScoreRecord,
  MatchSetupConfig,
  OpponentType,
  SavedActiveMatch,
  UserPreferences,
} from '../state/storage.ts';
import { MODE_LABELS } from '../state/matchTypes.ts';

type StartScreenProps = {
  readonly initialConfig: MatchSetupConfig;
  readonly savedMatch: SavedActiveMatch | null;
  readonly records: readonly MatchScoreRecord[];
  readonly solvedPuzzles: ReadonlySet<string>;
  readonly prefs: UserPreferences;
  readonly onUpdatePrefs: (patch: Partial<UserPreferences>) => void;
  readonly onStartMatch: (config: MatchSetupConfig) => void;
  readonly onResumeSaved: () => void;
  readonly onDiscardSaved: () => void;
  readonly onImportCode: (code: string, openInReplay: boolean) => boolean;
};

const MODE_CARDS: readonly {
  mode: GameMode;
  title: string;
  badge: string;
  desc: string;
  accent: string;
}[] = [
  {
    mode: 'solo',
    title: 'Solo Arena',
    badge: '1P + 3 AI · 20×20',
    desc: 'Claim the top-left corner and outmaneuver three adaptive AI rivals.',
    accent: PLAYER_COLORS[0],
  },
  {
    mode: 'duo_coop',
    title: '2 Humans + 2 AI',
    badge: '2P + 2 AI · 20×20',
    desc: 'Two human players command opposite corners alongside two AI opponents.',
    accent: PLAYER_COLORS[1],
  },
  {
    mode: 'tournament_1v1',
    title: '1v1 Pro Tournament',
    badge: 'Dual-Color · 20×20',
    desc: 'Official championship format: command Blue + Coral against Amber + Jade.',
    accent: PLAYER_COLORS[2],
  },
  {
    mode: 'blokus_duo',
    title: 'Blokus Duo 14×14',
    badge: 'Duel · 14×14',
    desc: 'Fast, knife-edge 2-color duel expanding outward from inner center anchors.',
    accent: PLAYER_COLORS[3],
  },
  {
    mode: 'pass_play',
    title: '4P Pass & Play',
    badge: '4 Humans · 20×20',
    desc: 'Four players around one screen — toggle AI Autoplay for any seat anytime.',
    accent: '#a78bfa',
  },
  {
    mode: 'puzzle',
    title: 'Endgame Puzzles',
    badge: '6 Challenges',
    desc: 'Thread every remaining polyomino into razor-tight tactical pockets.',
    accent: '#38bdf8',
  },
];

export function StartScreen({
  initialConfig,
  savedMatch,
  records,
  solvedPuzzles,
  prefs,
  onUpdatePrefs,
  onStartMatch,
  onResumeSaved,
  onDiscardSaved,
  onImportCode,
}: StartScreenProps) {
  const [mode, setMode] = useState<GameMode>(initialConfig.mode);
  const [difficulty, setDifficulty] = useState<AIDifficulty>(initialConfig.difficulty);
  const [opponentType, setOpponentType] = useState<OpponentType>(initialConfig.opponentType);
  const [clockPreset, setClockPreset] = useState<ClockPreset>(initialConfig.clockPreset);
  const [puzzleId, setPuzzleId] = useState<string>(initialConfig.puzzleId ?? PUZZLES[0].id);
  const [importOpen, setImportOpen] = useState(false);
  const [shareInput, setShareInput] = useState('');
  const [importError, setImportError] = useState('');

  const needsAI =
    mode === 'solo' ||
    mode === 'duo_coop' ||
    ((mode === 'tournament_1v1' || mode === 'blokus_duo') && opponentType === 'ai');
  const supportsOpponentToggle = mode === 'tournament_1v1' || mode === 'blokus_duo';

  const handleLaunch = () => {
    onStartMatch({
      mode,
      difficulty,
      opponentType,
      clockPreset: mode === 'puzzle' ? 'off' : clockPreset,
      scoringRule: prefs.scoringRule,
      ...(mode === 'puzzle' ? { puzzleId } : {}),
    });
  };

  const handleImport = (openInReplay: boolean) => {
    const ok = onImportCode(shareInput, openInReplay);
    if (!ok) {
      setImportError('Invalid BLKS1 share code. Check the pasted string and try again.');
    } else {
      setImportError('');
      setShareInput('');
      setImportOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f171c] text-[#f1f1eb] relative overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(66,182,255,0.12),transparent_42%),radial-gradient(circle_at_18%_80%,rgba(255,92,112,0.09),transparent_45%)]" />

      <header className="relative z-10 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/5 p-1.5 ring-1 ring-white/10">
            {PLAYER_COLORS.map((c) => (
              <span key={c} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: c }} />
            ))}
          </div>
          <div>
            <span className="text-lg font-extrabold tracking-[0.22em] text-white">BLOKUS</span>
            <span className="ml-2.5 hidden text-xs uppercase tracking-widest text-slate-400 sm:inline">
              Tactical Polyomino Edition
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => onUpdatePrefs({ soundMuted: !prefs.soundMuted })}
            className="rounded-lg bg-white/5 px-3 py-1.5 font-medium text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10"
          >
            {prefs.soundMuted ? 'Sound: Off' : 'Sound: On'}
          </button>
          <button
            type="button"
            onClick={() => onUpdatePrefs({ colorblindMode: !prefs.colorblindMode })}
            className={`rounded-lg px-3 py-1.5 font-medium ring-1 transition ${
              prefs.colorblindMode
                ? 'bg-amber-400/20 text-amber-200 ring-amber-400/40'
                : 'bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10'
            }`}
          >
            {prefs.colorblindMode ? 'Colorblind Patterns: On' : 'Colorblind: Off'}
          </button>
          <button
            type="button"
            onClick={() =>
              onUpdatePrefs({
                scoringRule: (prefs.scoringRule === 'official' ? 'positive' : 'official') as ScoringRule,
              })
            }
            className="rounded-lg bg-white/5 px-3 py-1.5 font-medium text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10"
          >
            Scoring: {prefs.scoringRule === 'official' ? 'Official (-89..+20)' : 'Squares (+)'}
          </button>
          <button
            type="button"
            onClick={() => setImportOpen((v) => !v)}
            className="rounded-lg bg-sky-500/15 px-3 py-1.5 font-semibold text-sky-300 ring-1 ring-sky-400/30 transition hover:bg-sky-500/25"
          >
            Import Code
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-12 pt-2">
        {savedMatch && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-500/10 px-5 py-3.5 ring-1 ring-emerald-400/30">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                Saved Match in Progress
              </div>
              <div className="text-sm text-slate-200">
                {MODE_LABELS[savedMatch.config.mode]} · {savedMatch.historyIndex} moves recorded
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onResumeSaved}
                className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 transition hover:bg-emerald-300"
              >
                Resume Match
              </button>
              <button
                type="button"
                onClick={onDiscardSaved}
                className="rounded-xl bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 ring-1 ring-white/10 hover:bg-white/10"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {importOpen && (
          <div className="mb-6 rounded-2xl bg-slate-900/90 p-4 ring-1 ring-sky-400/30">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-sky-300">
              Import Match / Replay Code (BLKS1-…)
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={shareInput}
                onChange={(e) => setShareInput(e.target.value)}
                placeholder="Paste BLKS1-... match code here"
                className="min-w-[240px] flex-1 rounded-xl bg-black/40 px-3.5 py-2 text-sm text-white ring-1 ring-white/15 focus:outline-none focus:ring-sky-400"
              />
              <button
                type="button"
                onClick={() => handleImport(true)}
                className="rounded-xl bg-sky-400 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 hover:bg-sky-300"
              >
                Watch Replay
              </button>
              <button
                type="button"
                onClick={() => handleImport(false)}
                className="rounded-xl bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/15"
              >
                Load & Play
              </button>
            </div>
            {importError && <p className="mt-2 text-xs text-rose-400">{importError}</p>}
          </div>
        )}

        <div className="mb-6">
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            Claim corners. Cut off corridors. Leave zero squares behind.
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-400">
            Connect same-color polyominoes corner-to-corner — never edge-to-edge. Choose a mode below to launch.
          </p>
        </div>

        <section aria-label="Game modes" className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {MODE_CARDS.map((card) => {
            const active = mode === card.mode;
            return (
              <button
                key={card.mode}
                type="button"
                onClick={() => setMode(card.mode)}
                className={`group flex flex-col justify-between rounded-2xl p-4 text-left transition ${
                  active
                    ? 'bg-white/[0.09] ring-2 ring-amber-400 shadow-lg shadow-black/40'
                    : 'bg-white/[0.035] ring-1 ring-white/10 hover:bg-white/[0.06]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: card.accent }}
                    />
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-slate-300">
                      {card.badge}
                    </span>
                  </div>
                  <h2 className="mt-2.5 text-base font-bold text-white">{card.title}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{card.desc}</p>
                </div>
              </button>
            );
          })}
        </section>

        <section className="mt-6 rounded-2xl bg-white/[0.04] p-5 ring-1 ring-white/10">
          {mode === 'puzzle' ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  Select Endgame Challenge ({solvedPuzzles.size}/{PUZZLES.length} Solved)
                </span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {PUZZLES.map((pz) => {
                  const selected = puzzleId === pz.id;
                  const solved = solvedPuzzles.has(pz.id);
                  return (
                    <button
                      key={pz.id}
                      type="button"
                      onClick={() => setPuzzleId(pz.id)}
                      className={`rounded-xl p-3 text-left transition ${
                        selected
                          ? 'bg-sky-400/15 ring-2 ring-sky-400'
                          : 'bg-black/25 ring-1 ring-white/10 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white">{pz.title}</span>
                        <span className={solved ? 'font-bold text-emerald-400' : 'text-slate-400'}>
                          {solved ? '★ SOLVED' : pz.difficulty}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">{pz.subtitle}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              {supportsOpponentToggle && (
                <div>
                  <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Opponent
                  </div>
                  <div className="inline-flex rounded-xl bg-black/30 p-1 ring-1 ring-white/10">
                    {(['ai', 'human'] as OpponentType[]).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setOpponentType(opt)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                          opponentType === opt ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {opt === 'ai' ? 'vs AI' : 'vs Local 2P'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {needsAI && (
                <div>
                  <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    AI Strength
                  </div>
                  <div className="inline-flex rounded-xl bg-black/30 p-1 ring-1 ring-white/10">
                    {(['easy', 'medium', 'hard'] as AIDifficulty[]).map((lv) => (
                      <button
                        key={lv}
                        type="button"
                        onClick={() => setDifficulty(lv)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                          difficulty === lv ? 'bg-sky-400 text-slate-950' : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {lv}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Chess Clock
                </div>
                <div className="inline-flex rounded-xl bg-black/30 p-1 ring-1 ring-white/10">
                  {(
                    [
                      ['off', 'Untimed'],
                      ['blitz_3m', 'Blitz 3m+3s'],
                      ['rapid_5m', 'Rapid 5m+5s'],
                    ] as const
                  ).map(([preset, label]) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setClockPreset(preset)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        clockPreset === preset ? 'bg-emerald-400 text-slate-950' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
            <div className="text-xs text-slate-400">
              Shortcuts: <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">R</kbd> Rotate ·{' '}
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">F</kbd> Mirror ·{' '}
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">1–5</kbd> Size Filter ·{' '}
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200">Z</kbd> Undo · Wheel / Drag supported
            </div>
            <button
              type="button"
              onClick={handleLaunch}
              className="rounded-xl bg-amber-400 px-7 py-3 text-sm font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-300"
            >
              {mode === 'puzzle' ? 'Start Puzzle' : 'Start Match'}
            </button>
          </div>
        </section>

        {records.length > 0 && (
          <section className="mt-6 rounded-2xl bg-white/[0.025] p-4 ring-1 ring-white/10">
            <div className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-400">
              Recent Hall of Fame
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {records.slice(0, 4).map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between rounded-xl bg-black/25 px-3 py-2 text-xs ring-1 ring-white/5"
                >
                  <div>
                    <div className="font-bold text-white">
                      {rec.winnerName} · <span className="text-emerald-400">{rec.result}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {MODE_LABELS[rec.mode]} · {rec.date}
                    </div>
                  </div>
                  <div className="text-sm font-black text-amber-300">
                    {rec.scoringRule === 'official' && rec.score > 0 ? `+${rec.score}` : rec.score}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
