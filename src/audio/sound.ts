type WebAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let audioCtx: AudioContext | null = null;
let muted = false;

export function setSoundMuted(nextMuted: boolean): void {
  muted = nextMuted;
}

export function isSoundMuted(): boolean {
  return muted;
}

function getContext(): AudioContext | null {
  if (muted || typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext;
    if (!Ctor) return null;
    try {
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(
  freqStart: number,
  freqEnd: number,
  durationSec: number,
  type: OscillatorType,
  gainPeak: number,
  delaySec = 0,
): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime + delaySec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, now);
  if (freqEnd !== freqStart) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(28, freqEnd), now + durationSec);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationSec + 0.015);
}

function playFilteredNoise(
  durationSec: number,
  filterFreqStart: number,
  filterFreqEnd: number,
  q: number,
  gainPeak: number,
  delaySec = 0,
): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime + delaySec;
  const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i += 1) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleCount * 0.45));
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.setValueAtTime(q, now);
  filter.frequency.setValueAtTime(filterFreqStart, now);
  if (filterFreqEnd !== filterFreqStart) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, filterFreqEnd), now + durationSec);
  }

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);
  source.stop(now + durationSec + 0.01);
}

/**
 * Air rush as the 4 extruded 3D pentominoes dive from high altitude (Stage A: 0–195ms).
 */
export function playDiveWhooshSound(): void {
  playFilteredNoise(0.18, 220, 920, 1.2, 0.045, 0);
}

/**
 * Heavy physical rigid-body slam + acrylic crystal transient at t = 200ms (Stage B).
 */
export function playSlamImpactSound(): void {
  // Deep sub-bass kinetic thud
  playTone(118, 34, 0.21, 'sine', 0.26, 0);
  playTone(86, 30, 0.16, 'triangle', 0.16, 0.004);
  // Crisp acrylic-on-stone transient click
  playFilteredNoise(0.065, 1350, 420, 1.5, 0.16, 0);
  // Subtle crystalline resonance shimmer
  playTone(587.33, 580, 0.14, 'sine', 0.032, 0.012);
  playTone(880, 872, 0.12, 'triangle', 0.022, 0.018);
}

export function playSelectSound(): void {
  playTone(390, 520, 0.042, 'sine', 0.05);
}

export function playRotateSound(): void {
  playTone(560, 740, 0.036, 'triangle', 0.045);
}

export function playFlip3DSound(): void {
  playTone(410, 640, 0.048, 'sine', 0.048, 0);
  playTone(640, 490, 0.045, 'triangle', 0.038, 0.035);
}

export function playPlaceSound(pieceSize = 5): void {
  const base = 290 + pieceSize * 26;
  playTone(140, 52, 0.075, 'sine', 0.09, 0);
  playTone(base, base * 1.42, 0.07, 'triangle', 0.08, 0.004);
  playTone(base * 2, base * 2.01, 0.085, 'sine', 0.038, 0.014);
}

export function playInvalidSound(): void {
  playTone(165, 118, 0.08, 'sine', 0.045);
}

export function playPassSound(): void {
  playTone(370, 310, 0.065, 'sine', 0.035);
}

export function playVictorySound(): void {
  const notes = [523.25, 659.25, 783.99, 987.77, 1174.66];
  notes.forEach((freq, idx) => {
    playTone(freq, freq, 0.26, 'sine', 0.055, idx * 0.075);
  });
}
