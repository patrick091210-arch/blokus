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
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + durationSec);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationSec + 0.01);
}

export function playSelectSound(): void {
  playTone(360, 480, 0.045, 'sine', 0.055);
}

export function playRotateSound(): void {
  playTone(540, 720, 0.038, 'triangle', 0.05);
}

export function playPlaceSound(pieceSize = 5): void {
  const base = 310 + pieceSize * 28;
  playTone(base, base * 1.45, 0.075, 'triangle', 0.095);
  playTone(base * 2, base * 2.02, 0.09, 'sine', 0.045, 0.015);
}

export function playInvalidSound(): void {
  playTone(185, 130, 0.095, 'triangle', 0.065);
}

export function playPassSound(): void {
  playTone(392, 330, 0.07, 'sine', 0.045);
  playTone(330, 262, 0.09, 'sine', 0.04, 0.055);
}

export function playVictorySound(): void {
  const notes = [523.25, 659.25, 783.99, 987.77, 1174.66];
  notes.forEach((freq, idx) => {
    playTone(freq, freq, 0.22, 'triangle', 0.07, idx * 0.065);
  });
}
