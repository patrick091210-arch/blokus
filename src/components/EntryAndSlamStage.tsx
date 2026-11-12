import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { PLAYER_COLORS, PUZZLES } from '../engine/index.ts';
import type { AIDifficulty } from '../engine/index.ts';
import {
  playDiveWhooshSound,
  playSelectSound,
  playSlamImpactSound,
} from '../audio/sound.ts';
import type { MatchSetupConfig, SurfaceTheme } from '../state/storage.ts';
import {
  ModeSymbolicGlyph,
  SLAM_BLOCKS,
  VoxelPentomino3D,
  drawShockwaveFrame,
} from './SlamVoxelPiece.tsx';
import type { SlamBlockSpec } from './SlamVoxelPiece.tsx';

export type IntroStage = 'entry' | 'slam' | 'modes';

type EntryAndSlamStageProps = {
  readonly stage: IntroStage;
  readonly surfaceTheme: SurfaceTheme;
  readonly solvedPuzzles: ReadonlySet<string>;
  readonly hasSavedMatch: boolean;
  readonly onChangeStage: (next: IntroStage) => void;
  readonly onStartMatch: (config: MatchSetupConfig) => void;
  readonly onResumeSaved: () => void;
};

function getCardTargetSlot(index: number, vw: number): { x: number; y: number } {
  if (vw < 720) {
    const col = index % 2 === 0 ? -1 : 1;
    const row = index < 2 ? -1 : 1;
    const gx = Math.min(86, vw * 0.22);
    return { x: col * gx, y: row * 96 };
  }
  const spacing = Math.min(182, vw * 0.2);
  return { x: (index - 1.5) * spacing, y: 0 };
}

export function EntryAndSlamStage({
  stage,
  surfaceTheme,
  solvedPuzzles,
  hasSavedMatch,
  onChangeStage,
  onStartMatch,
  onResumeSaved,
}: EntryAndSlamStageProps) {
  const [playMagnet, setPlayMagnet] = useState({ x: 0, y: 0, near: false });
  const [expandedCard, setExpandedCard] = useState<SlamBlockSpec['id'] | null>(null);
  const [hoveredCard, setHoveredCard] = useState<{
    id: SlamBlockSpec['id'];
    rx: number;
    ry: number;
  } | null>(null);

  const playBtnRef = useRef<HTMLButtonElement | null>(null);
  const shockCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<HTMLDivElement | null>(null);
  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shadowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const slamStartRef = useRef<number>(0);

  const triggerPlay = useCallback(() => {
    if (stage !== 'entry') return;
    slamStartRef.current = performance.now();
    playDiveWhooshSound();
    onChangeStage('slam');
  }, [onChangeStage, stage]);

  const skipSlam = useCallback(() => {
    if (stage !== 'slam') return;
    if (performance.now() - slamStartRef.current < 90) return;
    if (cameraRef.current) cameraRef.current.style.transform = '';
    onChangeStage('modes');
  }, [onChangeStage, stage]);

  // 740ms 3-Stage rAF Slam Choreographer (Stage A 0-200ms -> Stage B 200-340ms -> Stage C 340-740ms)
  useEffect(() => {
    if (stage !== 'slam') return;
    let rafId = 0;
    let impactFired = false;
    const startTs = performance.now();

    const step = (now: number) => {
      const t = now - startTs;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (t >= 200 && !impactFired) {
        impactFired = true;
        playSlamImpactSound();
      }

      // Camera shake (200ms - 330ms): crisp damped rigid-body impulse
      if (cameraRef.current) {
        if (t >= 200 && t <= 335) {
          const dt = (t - 200) / 135;
          const decay = Math.exp(-5.4 * dt);
          const sx = Math.sin(dt * 46) * 10.5 * decay;
          const sy = Math.cos(dt * 54) * 8.5 * decay;
          const sr = Math.sin(dt * 38) * 0.85 * decay;
          cameraRef.current.style.transform = `translate3d(${sx.toFixed(2)}px, ${sy.toFixed(2)}px, 0) rotateZ(${sr.toFixed(2)}deg)`;
        } else {
          cameraRef.current.style.transform = 'translate3d(0,0,0)';
        }
      }

      // Canvas shockwave ripple (200ms - 650ms)
      const canvas = shockCanvasRef.current;
      if (canvas) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (canvas.width !== Math.floor(vw * dpr) || canvas.height !== Math.floor(vh * dpr)) {
          canvas.width = Math.floor(vw * dpr);
          canvas.height = Math.floor(vh * dpr);
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          drawShockwaveFrame(ctx, vw, vh, t - 200, surfaceTheme === 'light');
        }
      }

      // Drive the 4 extruded 3D pentominoes + dynamic ground AO contact shadows
      SLAM_BLOCKS.forEach((spec, idx) => {
        const el = blockRefs.current[idx];
        const sh = shadowRefs.current[idx];
        if (!el || !sh) return;

        const slot = getCardTargetSlot(idx, vw);

        if (t < 200) {
          // Stage A: High-altitude accelerating dive
          const p = Math.min(1, Math.max(0, t / 200));
          const g = Math.pow(p, 2.35);
          const inv = 1 - g;
          const x = spec.startPos.x * inv + spec.impactPos.x * g;
          const y = spec.startPos.y * inv + spec.impactPos.y * g;
          const z = spec.startPos.z * inv;
          const rx = spec.startPos.rx * inv;
          const ry = spec.startPos.ry * inv;
          const rz = spec.startPos.rz * inv;

          el.style.opacity = String(Math.min(1, p * 3.2));
          el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateX(${rx.toFixed(1)}deg) rotateY(${ry.toFixed(1)}deg) rotateZ(${rz.toFixed(1)}deg)`;

          sh.style.opacity = String(0.06 + g * 0.56);
          sh.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${(1.8 - g * 0.8).toFixed(2)})`;
          sh.style.filter = `blur(${(26 - g * 20).toFixed(1)}px)`;
        } else if (t < 340) {
          // Stage B: Rigid lock on grid plane + subtle rebound compression
          const b = (t - 200) / 140;
          const bounceZ = Math.sin(b * Math.PI) * 8 * (1 - b);
          el.style.opacity = '1';
          el.style.transform = `translate3d(${spec.impactPos.x}px, ${spec.impactPos.y}px, ${bounceZ.toFixed(1)}px)`;
          sh.style.opacity = '0.68';
          sh.style.transform = `translate3d(${spec.impactPos.x}px, ${spec.impactPos.y}px, 0) scale(1.02)`;
          sh.style.filter = 'blur(6px)';
        } else {
          // Stage C: Inertial spring glide into exact Mode Card positions
          const u = Math.min(1, (t - 340) / 400);
          const ease = 1 - Math.pow(1 - u, 3.6);
          const x = spec.impactPos.x + (slot.x - spec.impactPos.x) * ease;
          const y = spec.impactPos.y + ((slot.y - 18) - spec.impactPos.y) * ease;
          const scale = 1 - 0.22 * ease;
          el.style.opacity = String(1 - u * 0.15);
          el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${(12 * ease).toFixed(1)}px) scale(${scale.toFixed(3)})`;
          sh.style.opacity = String(0.62 * (1 - u * 0.65));
          sh.style.transform = `translate3d(${x.toFixed(1)}px, ${(y + 18).toFixed(1)}px, 0) scale(${(1 + 0.35 * ease).toFixed(2)})`;
          sh.style.filter = `blur(${(6 + 12 * ease).toFixed(1)}px)`;
        }
      });

      if (t < 740) {
        rafId = requestAnimationFrame(step);
      } else {
        if (cameraRef.current) cameraRef.current.style.transform = '';
        onChangeStage('modes');
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [onChangeStage, stage, surfaceTheme]);

  // ESC skips slam or collapses expanded mode card
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (stage === 'slam') skipSlam();
        else if (expandedCard) setExpandedCard(null);
      } else if ((e.key === 'Enter' || e.key === ' ') && stage === 'entry') {
        e.preventDefault();
        triggerPlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedCard, skipSlam, stage, triggerPlay]);

  const handleEntryPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stage !== 'entry' || !playBtnRef.current) return;
    const rect = playBtnRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < 125) {
      const pull = (1 - dist / 125) * 8;
      const angle = Math.atan2(dy, dx);
      setPlayMagnet({ x: Math.cos(angle) * pull, y: Math.sin(angle) * pull, near: true });
    } else if (playMagnet.near) {
      setPlayMagnet({ x: 0, y: 0, near: false });
    }
  };

  const launch = (partial: Partial<MatchSetupConfig> & { mode: MatchSetupConfig['mode'] }) => {
    playSelectSound();
    onStartMatch({
      mode: partial.mode,
      difficulty: partial.difficulty ?? 'medium',
      opponentType: partial.opponentType ?? 'ai',
      clockPreset: 'off',
      scoringRule: 'official',
      ...(partial.puzzleId ? { puzzleId: partial.puzzleId } : {}),
    });
  };

  return (
    <div
      ref={cameraRef}
      onPointerMove={handleEntryPointerMove}
      onClick={() => {
        if (stage === 'slam') skipSlam();
      }}
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
    >
      {/* Stage 1: Minimalist Entry Screen */}
      {stage === 'entry' && (
        <div className="flex flex-col items-center justify-center gap-14">
          <div className="flex flex-col items-center">
            <div className="animate-logo-breathe flex flex-col items-center gap-6">
              <div className="grid grid-cols-2 gap-2.5 p-2">
                {PLAYER_COLORS.map((c, idx) => (
                  <span
                    key={c}
                    className="h-7 w-7 rounded-[5px] acrylic-tile"
                    style={
                      {
                        '--tile-color': c,
                        transform: idx === 0 ? 'translate(-2px, -2px)' : idx === 3 ? 'translate(2px, 2px)' : undefined,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
              <h1 className="text-2xl font-light tracking-[0.52em] pl-[0.52em] opacity-90">
                BLOKUS
              </h1>
            </div>
            <div
              className="mt-4 h-2.5 w-28 rounded-full blur-md transition-opacity duration-700"
              style={{ background: 'var(--ao-shadow)', opacity: 0.45 }}
            />
          </div>

          <button
            ref={playBtnRef}
            type="button"
            onClick={triggerPlay}
            className="group relative flex items-center gap-3 px-8 py-4 text-xs font-medium tracking-[0.38em] pl-[calc(2rem+0.38em)] transition-transform duration-200 ease-out"
            style={{
              transform: `translate3d(${playMagnet.x.toFixed(1)}px, ${playMagnet.y.toFixed(1)}px, 0)`,
              color: playMagnet.near ? 'var(--fg-primary)' : 'var(--fg-muted)',
            }}
          >
            <span
              className="pointer-events-none absolute inset-0 rounded-full transition-opacity duration-300"
              style={{
                opacity: playMagnet.near ? 1 : 0,
                background: 'radial-gradient(circle, rgba(56,168,255,0.14) 0%, transparent 72%)',
              }}
            />
            <span className="inline-block text-[10px] transition-transform duration-300 group-hover:translate-x-0.5">
              ▶
            </span>
            <span>PLAY</span>
          </button>
        </div>
      )}

      {/* Stage 2: 3D Block Slam + Canvas Geometric Shockwave */}
      {stage === 'slam' && (
        <>
          <canvas
            ref={shockCanvasRef}
            className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          />
          <div
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
            style={{ perspective: '960px', transformStyle: 'preserve-3d' }}
          >
            {SLAM_BLOCKS.map((spec, idx) => (
              <div key={`sh-${spec.id}`} className=" contents">
                <div
                  ref={(el) => {
                    shadowRefs.current[idx] = el;
                  }}
                  className="absolute h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-2xl"
                  style={{ background: 'var(--ao-shadow)', opacity: 0 }}
                />
                <div
                  ref={(el) => {
                    blockRefs.current[idx] = el;
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ transformStyle: 'preserve-3d', opacity: 0 }}
                >
                  <VoxelPentomino3D pieceId={spec.pieceId} color={spec.color} unit={22} depth={18} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Stage 3: Ultra-Clean Symbolic Mode Selection Cards */}
      {stage === 'modes' && (
        <div
          className="relative z-20 flex flex-wrap items-center justify-center gap-5 px-6 max-w-4xl"
          style={{ perspective: '1000px' }}
        >
          {hasSavedMatch && (
            <button
              type="button"
              onClick={onResumeSaved}
              aria-label="Resume match"
              title="Resume"
              className="fixed left-6 top-6 flex h-8 w-8 items-center justify-center rounded-full text-sm opacity-35 transition hover:opacity-90"
            >
              ↺
            </button>
          )}

          {SLAM_BLOCKS.map((spec, idx) => {
            const isExpanded = expandedCard === spec.id;
            const tilt = hoveredCard?.id === spec.id ? hoveredCard : null;

            return (
              <div
                key={spec.id}
                onPointerMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  const nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
                  const ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
                  setHoveredCard({ id: spec.id, rx: -ny * 8.5, ry: nx * 8.5 });
                }}
                onPointerLeave={() => setHoveredCard((prev) => (prev?.id === spec.id ? null : prev))}
                style={{
                  background: isExpanded ? 'var(--card-surface-hover)' : 'var(--card-surface)',
                  border: `1px solid ${isExpanded ? spec.color : 'var(--card-border)'}`,
                  transform: tilt
                    ? `translate3d(0, -6px, 14px) rotateX(${tilt.rx.toFixed(1)}deg) rotateY(${tilt.ry.toFixed(1)}deg)`
                    : 'translate3d(0, 0, 0)',
                  transition: tilt
                    ? 'transform 90ms ease-out, background 280ms var(--ease-spring), border-color 280ms var(--ease-spring)'
                    : 'transform 420ms var(--ease-spring), background 280ms var(--ease-spring), border-color 280ms var(--ease-spring)',
                  animationDelay: `${idx * 35}ms`,
                }}
                className="group relative flex h-[204px] w-[154px] flex-col items-center justify-between rounded-3xl p-6 backdrop-blur-md shadow-xl"
              >
                <button
                  type="button"
                  onClick={() => {
                    playSelectSound();
                    setExpandedCard((prev) => (prev === spec.id ? null : spec.id));
                  }}
                  className="flex flex-1 w-full flex-col items-center justify-center gap-5"
                >
                  <ModeSymbolicGlyph modeId={spec.id} />
                  <span className="text-xs font-medium tracking-[0.26em] pl-[0.26em] opacity-85">
                    {spec.label}
                  </span>
                </button>

                {/* Progressive Disclosure Slot — zero page jumps */}
                <div
                  className="flex h-7 w-full items-center justify-center transition-all duration-300"
                  style={{
                    opacity: isExpanded ? 1 : 0,
                    transform: isExpanded ? 'translateY(0)' : 'translateY(6px)',
                    pointerEvents: isExpanded ? 'auto' : 'none',
                  }}
                >
                  {spec.id === 'solo' && (
                    <div className="flex items-center gap-3">
                      {(['easy', 'medium', 'hard'] as AIDifficulty[]).map((diff, dIdx) => (
                        <button
                          key={diff}
                          type="button"
                          aria-label={diff}
                          onClick={() => launch({ mode: 'solo', difficulty: diff })}
                          className="rounded-full px-2 py-1 text-xs tracking-tighter opacity-55 transition hover:opacity-100 hover:scale-125"
                          style={{ color: spec.color }}
                        >
                          {'•'.repeat(dIdx + 1)}
                        </button>
                      ))}
                    </div>
                  )}

                  {spec.id === 'duel' && (
                    <div className="flex items-center gap-2.5 text-[10px] font-semibold tracking-widest">
                      <button
                        type="button"
                        onClick={() => launch({ mode: 'blokus_duo', opponentType: 'ai' })}
                        className="opacity-60 transition hover:opacity-100"
                        style={{ color: spec.color }}
                      >
                        DUO
                      </button>
                      <span className="opacity-20">·</span>
                      <button
                        type="button"
                        onClick={() => launch({ mode: 'tournament_1v1', opponentType: 'ai' })}
                        className="opacity-60 transition hover:opacity-100"
                        style={{ color: spec.color }}
                      >
                        PRO
                      </button>
                      <span className="opacity-20">·</span>
                      <button
                        type="button"
                        onClick={() => launch({ mode: 'blokus_duo', opponentType: 'human' })}
                        className="opacity-60 transition hover:opacity-100"
                        style={{ color: spec.color }}
                      >
                        2P
                      </button>
                    </div>
                  )}

                  {spec.id === 'party' && (
                    <div className="flex items-center gap-4 text-[10px] font-semibold tracking-widest">
                      <button
                        type="button"
                        onClick={() => launch({ mode: 'duo_coop' })}
                        className="opacity-60 transition hover:opacity-100"
                        style={{ color: spec.color }}
                      >
                        2P+AI
                      </button>
                      <span className="opacity-20">·</span>
                      <button
                        type="button"
                        onClick={() => launch({ mode: 'pass_play' })}
                        className="opacity-60 transition hover:opacity-100"
                        style={{ color: spec.color }}
                      >
                        4P
                      </button>
                    </div>
                  )}

                  {spec.id === 'puzzle' && (
                    <div className="flex items-center gap-2">
                      {PUZZLES.map((pz, pIdx) => {
                        const solved = solvedPuzzles.has(pz.id);
                        return (
                          <button
                            key={pz.id}
                            type="button"
                            aria-label={`Puzzle ${pIdx + 1}`}
                            onClick={() => launch({ mode: 'puzzle', puzzleId: pz.id })}
                            className="h-3.5 w-3.5 flex items-center justify-center transition hover:scale-125"
                          >
                            <span
                              className="block h-2 w-2 rounded-full transition"
                              style={{
                                backgroundColor: solved ? spec.color : 'transparent',
                                border: `1.5px solid ${spec.color}`,
                                opacity: solved ? 1 : 0.55,
                              }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
