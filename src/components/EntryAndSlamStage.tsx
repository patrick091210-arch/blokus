import { useCallback, useEffect, useRef, useState } from 'react';
import { PLAYER_COLORS, PUZZLES } from '../engine/index.ts';
import type { AIDifficulty } from '../engine/index.ts';
import {
  playDiveWhooshSound,
  playSelectSound,
  playSlamImpactSound,
} from '../audio/sound.ts';
import type { MatchSetupConfig, SurfaceTheme } from '../state/storage.ts';
import { buildAcrylicCellStyle } from './AcrylicPieceCell.tsx';
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

const LOGO_SINGLE_MASK = { top: false, right: false, bottom: false, left: false } as const;

function getCardSlotOffset(index: number, vw: number): { x: number; y: number } {
  if (vw < 768) {
    const col = index % 2 === 0 ? -1 : 1;
    const row = index < 2 ? -1 : 1;
    return { x: col * 87, y: row * 112 };
  }
  return { x: (index - 1.5) * 174, y: 0 };
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
  const cameraRef = useRef<HTMLDivElement | null>(null);
  const entryLayerRef = useRef<HTMLDivElement | null>(null);
  const slamLayerRef = useRef<HTMLDivElement | null>(null);
  const modesLayerRef = useRef<HTMLDivElement | null>(null);
  const shockCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shadowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const slamStartRef = useRef<number>(0);

  // Pre-size shockwave canvas outside the rAF loop so zero allocation happens mid-animation
  useEffect(() => {
    const syncCanvasSize = () => {
      const canvas = shockCanvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
    };
    syncCanvasSize();
    window.addEventListener('resize', syncCanvasSize);
    return () => window.removeEventListener('resize', syncCanvasSize);
  }, []);

  // Reset static layer styles cleanly when in steady 'entry' or 'modes' states
  useEffect(() => {
    if (stage === 'entry') {
      if (entryLayerRef.current) {
        entryLayerRef.current.style.opacity = '1';
        entryLayerRef.current.style.transform = 'translate3d(0,0,0) scale3d(1,1,1)';
      }
      if (slamLayerRef.current) slamLayerRef.current.style.opacity = '0';
      if (modesLayerRef.current) {
        modesLayerRef.current.style.opacity = '0';
        modesLayerRef.current.style.transform = 'translate3d(0,0,0) scale3d(0.96,0.96,1)';
      }
    } else if (stage === 'modes') {
      if (cameraRef.current) cameraRef.current.style.transform = 'translate3d(0,0,0)';
      if (entryLayerRef.current) entryLayerRef.current.style.opacity = '0';
      if (slamLayerRef.current) slamLayerRef.current.style.opacity = '0';
      if (modesLayerRef.current) {
        modesLayerRef.current.style.opacity = '1';
        modesLayerRef.current.style.transform = 'translate3d(0,0,0) scale3d(1,1,1)';
      }
      const canvas = shockCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [stage]);

  const triggerPlay = useCallback(() => {
    if (stage !== 'entry') return;
    slamStartRef.current = performance.now();
    playDiveWhooshSound();
    onChangeStage('slam');
  }, [onChangeStage, stage]);

  const skipSlam = useCallback(() => {
    if (stage !== 'slam') return;
    if (performance.now() - slamStartRef.current < 80) return;
    onChangeStage('modes');
  }, [onChangeStage, stage]);

  // Pure GPU 120fps Overlapping Choreographer (0ms -> 700ms, zero filter:blur, zero DOM mount!)
  useEffect(() => {
    if (stage !== 'slam') return;
    let rafId = 0;
    let impactFired = false;
    const startTs = performance.now();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const canvas = shockCanvasRef.current;
    const ctx = canvas?.getContext('2d') ?? null;

    if (slamLayerRef.current) slamLayerRef.current.style.opacity = '1';

    const step = (now: number) => {
      const t = now - startTs;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // 1. Overlapping Entry Collapse (0ms - 155ms)
      if (entryLayerRef.current) {
        const pe = Math.min(1, t / 155);
        const ease = pe * pe;
        entryLayerRef.current.style.opacity = String(Math.max(0, 1 - ease * 1.15));
        const sc = 1 - ease * 0.28;
        entryLayerRef.current.style.transform = `translate3d(0, 0, 0) scale3d(${sc.toFixed(3)}, ${sc.toFixed(3)}, 1)`;
      }

      // 2. Impact Audio & Damped Camera Shake (205ms - 330ms)
      if (t >= 205 && !impactFired) {
        impactFired = true;
        playSlamImpactSound();
      }

      if (cameraRef.current) {
        if (t >= 205 && t <= 330) {
          const dt = (t - 205) / 125;
          const decay = Math.exp(-5.6 * dt);
          const sx = Math.sin(dt * 48) * 9.5 * decay;
          const sy = Math.cos(dt * 56) * 7.8 * decay;
          const sr = Math.sin(dt * 40) * 0.75 * decay;
          cameraRef.current.style.transform = `translate3d(${sx.toFixed(2)}px, ${sy.toFixed(2)}px, 0) rotateZ(${sr.toFixed(2)}deg)`;
        } else {
          cameraRef.current.style.transform = 'translate3d(0,0,0)';
        }
      }

      // 3. Shockwave Canvas (205ms - 660ms)
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawShockwaveFrame(ctx, vw, vh, t - 205, surfaceTheme === 'light');
      }

      // 4. Continuous Overlapping 3D Blocks (15ms - 680ms: Dive -> Elastic Impact -> Spring Glide)
      SLAM_BLOCKS.forEach((spec, idx) => {
        const el = blockRefs.current[idx];
        const sh = shadowRefs.current[idx];
        if (!el || !sh) return;
        const slot = getCardSlotOffset(idx, vw);

        if (t < 205) {
          const p = Math.min(1, Math.max(0, (t - 15) / 190));
          const g = Math.pow(p, 2.25);
          const inv = 1 - g;
          const x = spec.startPos.x * inv + spec.impactPos.x * g;
          const y = spec.startPos.y * inv + spec.impactPos.y * g;
          const z = spec.startPos.z * inv;
          const rx = spec.startPos.rx * inv;
          const ry = spec.startPos.ry * inv;
          const rz = spec.startPos.rz * inv;

          el.style.opacity = String(Math.min(1, p * 3.5));
          el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateX(${rx.toFixed(1)}deg) rotateY(${ry.toFixed(1)}deg) rotateZ(${rz.toFixed(1)}deg)`;

          const shScale = 2.2 - g * 1.15;
          sh.style.opacity = String(0.08 + g * 0.72);
          sh.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale3d(${shScale.toFixed(2)}, ${shScale.toFixed(2)}, 1)`;
        } else if (t < 245) {
          // 40ms Elastic Impact Compression (Zero dead freeze — flows right into spring glide!)
          const b = (t - 205) / 40;
          const squashXY = 1 + Math.sin(b * Math.PI) * 0.07;
          el.style.opacity = '1';
          el.style.transform = `translate3d(${spec.impactPos.x}px, ${spec.impactPos.y}px, 0px) scale3d(${squashXY.toFixed(3)}, ${squashXY.toFixed(3)}, 1)`;
          sh.style.opacity = '0.85';
          sh.style.transform = `translate3d(${spec.impactPos.x}px, ${spec.impactPos.y}px, 0) scale3d(1.12, 1.12, 1)`;
        } else {
          // Continuous Underdamped Spring Glide (245ms - 700ms) into exact Card Slot!
          const u = Math.min(1, (t - 245) / 435);
          const spring = 1 - Math.exp(-6.5 * u) * Math.cos(3.2 * u);
          const x = spec.impactPos.x + (slot.x - spec.impactPos.x) * spring;
          const y = spec.impactPos.y + ((slot.y - 16) - spec.impactPos.y) * spring;
          const fadeOut = t > 440 ? Math.max(0, 1 - (t - 440) / 220) : 1;
          const sc = 1 - 0.24 * Math.min(1, spring);

          el.style.opacity = fadeOut.toFixed(3);
          el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${(10 * u).toFixed(1)}px) scale3d(${sc.toFixed(3)}, ${sc.toFixed(3)}, 1)`;
          sh.style.opacity = (0.75 * (1 - u)).toFixed(3);
          sh.style.transform = `translate3d(${x.toFixed(1)}px, ${(y + 14).toFixed(1)}px, 0) scale3d(${(1.1 + 0.4 * u).toFixed(2)}, ${(1.1 + 0.4 * u).toFixed(2)}, 1)`;
        }
      });

      // 5. Seamless Cross-Materialization of Pre-Mounted Mode Cards (340ms - 680ms)
      if (modesLayerRef.current) {
        if (t < 340) {
          modesLayerRef.current.style.opacity = '0';
          modesLayerRef.current.style.transform = 'translate3d(0, 0, 0) scale3d(0.94, 0.94, 1)';
        } else {
          const m = Math.min(1, (t - 340) / 330);
          const me = 1 - Math.pow(1 - m, 3.2);
          const mSc = 0.94 + 0.06 * me;
          modesLayerRef.current.style.opacity = me.toFixed(3);
          modesLayerRef.current.style.transform = `translate3d(0, 0, 0) scale3d(${mSc.toFixed(3)}, ${mSc.toFixed(3)}, 1)`;
        }
      }

      if (t < 700) {
        rafId = requestAnimationFrame(step);
      } else {
        onChangeStage('modes');
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [onChangeStage, stage, surfaceTheme]);

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
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist < 125) {
      const pull = (1 - dist / 125) * 7.5;
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
      style={{ willChange: 'transform' }}
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
    >
      {/* Pre-Mounted Layer 1: Minimalist Entry Screen */}
      <div
        ref={entryLayerRef}
        style={{
          pointerEvents: stage === 'entry' ? 'auto' : 'none',
          willChange: 'transform, opacity',
        }}
        className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-14"
      >
        <div className="flex flex-col items-center">
          <div className="animate-logo-breathe flex flex-col items-center gap-6">
            <div className="grid grid-cols-2 gap-2.5 p-2">
              {PLAYER_COLORS.map((c, idx) => (
                <span
                  key={c}
                  className="poly-cell block h-7 w-7"
                  style={{
                    ...buildAcrylicCellStyle(c, LOGO_SINGLE_MASK, 4, true),
                    transform:
                      idx === 0
                        ? 'translate3d(-2px, -2px, 0)'
                        : idx === 3
                          ? 'translate3d(2px, 2px, 0)'
                          : undefined,
                  }}
                >
                  <span className="poly-facet" />
                </span>
              ))}
            </div>
            <h1 className="text-2xl font-light tracking-[0.52em] pl-[0.52em] opacity-92">
              BLOKUS
            </h1>
          </div>
          <div className="gpu-ao-shadow mt-4 h-5 w-32 rounded-full opacity-55" />
        </div>

        <button
          ref={playBtnRef}
          type="button"
          onClick={triggerPlay}
          className="group relative flex items-center gap-3 px-8 py-4 text-xs font-medium tracking-[0.38em] pl-[calc(2rem+0.38em)] transition-transform duration-150 ease-out"
          style={{
            transform: `translate3d(${playMagnet.x.toFixed(1)}px, ${playMagnet.y.toFixed(1)}px, 0)`,
            color: playMagnet.near ? 'var(--fg-primary)' : 'var(--fg-muted)',
          }}
        >
          <span
            className="pointer-events-none absolute inset-0 rounded-full transition-opacity duration-300"
            style={{
              opacity: playMagnet.near ? 1 : 0,
              background: 'radial-gradient(circle, rgba(22,132,255,0.16) 0%, transparent 72%)',
            }}
          />
          <span className="inline-block text-[10px] transition-transform duration-300 group-hover:translate-x-0.5">
            ▶
          </span>
          <span>PLAY</span>
        </button>
      </div>

      {/* Pre-Mounted Layer 2: Shockwave Canvas + 3D Hexahedral Slam Sculptures */}
      <div
        ref={slamLayerRef}
        style={{ opacity: 0, willChange: 'opacity' }}
        className="pointer-events-none absolute inset-0 z-30"
      >
        <canvas ref={shockCanvasRef} className="absolute inset-0 h-full w-full" />
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ perspective: '960px', transformStyle: 'preserve-3d' }}
        >
          {SLAM_BLOCKS.map((spec, idx) => (
            <div key={`slam-${spec.id}`} className="contents">
              <div
                ref={(el) => {
                  shadowRefs.current[idx] = el;
                }}
                className="gpu-ao-shadow absolute h-24 w-24 rounded-full"
                style={{ opacity: 0 }}
              />
              <div
                ref={(el) => {
                  blockRefs.current[idx] = el;
                }}
                className="absolute"
                style={{ transformStyle: 'preserve-3d', opacity: 0, willChange: 'transform, opacity' }}
              >
                <VoxelPentomino3D pieceId={spec.pieceId} color={spec.color} unit={22} depth={16} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pre-Mounted Layer 3: Symbolic Mode Selection Cards (Zero Mount Stall!) */}
      <div
        ref={modesLayerRef}
        style={{
          opacity: 0,
          pointerEvents: stage === 'modes' ? 'auto' : 'none',
          perspective: '1000px',
          willChange: 'transform, opacity',
        }}
        className="absolute inset-0 z-20 flex items-center justify-center"
      >
        {hasSavedMatch && stage === 'modes' && (
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

        <div className="grid grid-cols-2 gap-5 px-6 md:grid-cols-4">
          {SLAM_BLOCKS.map((spec) => {
            const isExpanded = expandedCard === spec.id;
            const tilt = hoveredCard?.id === spec.id ? hoveredCard : null;

            return (
              <div
                key={spec.id}
                onPointerMove={(e) => {
                  if (stage !== 'modes') return;
                  const r = e.currentTarget.getBoundingClientRect();
                  const nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
                  const ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
                  setHoveredCard({ id: spec.id, rx: -ny * 8, ry: nx * 8 });
                }}
                onPointerLeave={() => setHoveredCard((prev) => (prev?.id === spec.id ? null : prev))}
                style={{
                  background: isExpanded ? 'var(--card-surface-hover)' : 'var(--card-surface)',
                  border: `1px solid ${isExpanded ? spec.color : 'var(--card-border)'}`,
                  boxShadow: 'var(--card-shadow)',
                  transform: tilt
                    ? `translate3d(0, -6px, 14px) rotateX(${tilt.rx.toFixed(1)}deg) rotateY(${tilt.ry.toFixed(1)}deg)`
                    : 'translate3d(0, 0, 0)',
                  transition: tilt
                    ? 'transform 85ms ease-out, background 260ms var(--ease-spring), border-color 260ms var(--ease-spring)'
                    : 'transform 400ms var(--ease-spring), background 260ms var(--ease-spring), border-color 260ms var(--ease-spring)',
                }}
                className="group relative flex h-[204px] w-[154px] flex-col items-center justify-between rounded-3xl p-6"
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
                  <span className="text-xs font-medium tracking-[0.26em] pl-[0.26em] opacity-88">
                    {spec.label}
                  </span>
                </button>

                <div
                  className="flex h-7 w-full items-center justify-center transition-all duration-300"
                  style={{
                    opacity: isExpanded ? 1 : 0,
                    transform: isExpanded ? 'translate3d(0, 0, 0)' : 'translate3d(0, 6px, 0)',
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
                          className="rounded-full px-2 py-1 text-xs tracking-tighter opacity-60 transition hover:opacity-100 hover:scale-125"
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
                        className="opacity-65 transition hover:opacity-100"
                        style={{ color: spec.color }}
                      >
                        DUO
                      </button>
                      <span className="opacity-20">·</span>
                      <button
                        type="button"
                        onClick={() => launch({ mode: 'tournament_1v1', opponentType: 'ai' })}
                        className="opacity-65 transition hover:opacity-100"
                        style={{ color: spec.color }}
                      >
                        PRO
                      </button>
                      <span className="opacity-20">·</span>
                      <button
                        type="button"
                        onClick={() => launch({ mode: 'blokus_duo', opponentType: 'human' })}
                        className="opacity-65 transition hover:opacity-100"
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
                        className="opacity-65 transition hover:opacity-100"
                        style={{ color: spec.color }}
                      >
                        2P+AI
                      </button>
                      <span className="opacity-20">·</span>
                      <button
                        type="button"
                        onClick={() => launch({ mode: 'pass_play' })}
                        className="opacity-65 transition hover:opacity-100"
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
                                opacity: solved ? 1 : 0.6,
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
      </div>
    </div>
  );
}
