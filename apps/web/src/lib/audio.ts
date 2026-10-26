type AudioContextCtor = typeof AudioContext;

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  const Ctor = window.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

/** Must be called from a user gesture before any sound can play. */
export function unlockAudio(): void {
  const context = audioContext();
  if (context && context.state === 'suspended') {
    void context.resume();
  }
}

export type Sfx = 'click' | 'move' | 'wall' | 'win' | 'lose' | 'draw' | 'invalid' | 'start' | 'undo';

interface Tone {
  readonly freq: number;
  readonly endFreq?: number;
  readonly at: number;
  readonly duration: number;
  readonly type: OscillatorType;
  readonly gain: number;
}

const RECIPES: Record<Sfx, readonly Tone[]> = {
  click: [{ freq: 520, endFreq: 640, at: 0, duration: 0.05, type: 'triangle', gain: 0.25 }],
  move: [
    { freq: 360, endFreq: 520, at: 0, duration: 0.08, type: 'sine', gain: 0.35 },
    { freq: 720, at: 0.04, duration: 0.05, type: 'triangle', gain: 0.12 },
  ],
  wall: [
    { freq: 170, endFreq: 96, at: 0, duration: 0.13, type: 'square', gain: 0.22 },
    { freq: 320, endFreq: 210, at: 0, duration: 0.09, type: 'triangle', gain: 0.14 },
  ],
  win: [
    { freq: 523.25, at: 0, duration: 0.1, type: 'triangle', gain: 0.28 },
    { freq: 659.25, at: 0.1, duration: 0.1, type: 'triangle', gain: 0.28 },
    { freq: 783.99, at: 0.2, duration: 0.12, type: 'triangle', gain: 0.28 },
    { freq: 1046.5, at: 0.32, duration: 0.22, type: 'triangle', gain: 0.3 },
  ],
  lose: [
    { freq: 392, at: 0, duration: 0.14, type: 'sine', gain: 0.24 },
    { freq: 311, at: 0.13, duration: 0.16, type: 'sine', gain: 0.22 },
    { freq: 233, at: 0.28, duration: 0.26, type: 'sine', gain: 0.2 },
  ],
  draw: [
    { freq: 440, at: 0, duration: 0.12, type: 'triangle', gain: 0.2 },
    { freq: 440, at: 0.16, duration: 0.16, type: 'triangle', gain: 0.18 },
  ],
  invalid: [{ freq: 150, endFreq: 110, at: 0, duration: 0.1, type: 'sawtooth', gain: 0.18 }],
  start: [
    { freq: 392, at: 0, duration: 0.08, type: 'triangle', gain: 0.2 },
    { freq: 587.33, at: 0.08, duration: 0.12, type: 'triangle', gain: 0.22 },
  ],
  undo: [{ freq: 420, endFreq: 300, at: 0, duration: 0.09, type: 'sine', gain: 0.2 }],
};

export function playSfx(kind: Sfx, volume = 0.6, muted = false): void {
  if (muted || volume <= 0) return;
  const context = audioContext();
  if (!context || context.state !== 'running') return;

  const master = context.createGain();
  master.gain.value = Math.min(1, Math.max(0, volume));
  master.connect(context.destination);

  const now = context.currentTime;
  for (const tone of RECIPES[kind]) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.freq, now + tone.at);
    if (tone.endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, tone.endFreq), now + tone.at + tone.duration);
    }
    gain.gain.setValueAtTime(0.0001, now + tone.at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, tone.gain), now + tone.at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.at + tone.duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now + tone.at);
    osc.stop(now + tone.at + tone.duration + 0.02);
  }

  window.setTimeout(() => master.disconnect(), 900);
}

export function isAudioReady(): boolean {
  return ctx !== null && ctx.state === 'running';
}
