"use client";
/** Small synth for UI sounds with WebAudio. Silent until the first tap, and only when sound is on. */
let ctx: AudioContext | null = null;
let out: GainNode | null = null;

function ac() {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (!out) {
      // master bus with a short echo so blips sound less "beepy"
      out = ctx.createGain();
      out.gain.value = 0.9;
      const delay = ctx.createDelay();
      delay.delayTime.value = 0.11;
      const fb = ctx.createGain();
      fb.gain.value = 0.18;
      out.connect(ctx.destination);
      out.connect(delay);
      delay.connect(fb).connect(delay);
      delay.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface Note {
  f: number;
  at: number;
  len: number;
  type?: OscillatorType;
  vol?: number;
  /** Slide to this frequency over the note. */
  to?: number;
}

function play(notes: Note[]) {
  const a = ac();
  if (!a || !out) return;
  const t0 = a.currentTime + 0.01;
  for (const n of notes) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = n.type ?? "triangle";
    o.frequency.setValueAtTime(n.f, t0 + n.at);
    if (n.to) o.frequency.exponentialRampToValueAtTime(n.to, t0 + n.at + n.len);
    const v = n.vol ?? 0.06;
    g.gain.setValueAtTime(0.0001, t0 + n.at);
    g.gain.exponentialRampToValueAtTime(v, t0 + n.at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.len);
    o.connect(g).connect(out);
    o.start(t0 + n.at);
    o.stop(t0 + n.at + n.len + 0.05);
  }
}

/** Two voices an octave-ish apart: a soft square for bite plus a triangle for body. */
const duo = (f: number, at: number, len: number, vol = 0.05): Note[] => [
  { f, at, len, type: "triangle", vol },
  { f: f * 2, at, len: len * 0.7, type: "square", vol: vol * 0.25 },
];

/** Bell: a sine with inharmonic partials and a long tail. */
const bell = (f: number, at: number, vol = 0.05): Note[] => [
  { f, at, len: 1.2, type: "sine", vol },
  { f: f * 2.76, at, len: 0.6, type: "sine", vol: vol * 0.35 },
  { f: f * 5.4, at, len: 0.3, type: "sine", vol: vol * 0.15 },
];

export const SFX = {
  coin: () => play([...duo(988, 0, 0.08, 0.045), ...duo(1319, 0.07, 0.22, 0.045)]),
  good: () => play([...duo(523, 0, 0.1), ...duo(659, 0.07, 0.1), ...duo(784, 0.14, 0.1), ...duo(1047, 0.21, 0.28, 0.04)]),
  bad: () => play([{ f: 220, to: 140, at: 0, len: 0.35, type: "sawtooth", vol: 0.035 }, { f: 110, to: 70, at: 0, len: 0.4, type: "sine", vol: 0.08 }]),
  badge: () =>
    play([523, 659, 784, 1047].flatMap((f, k) => duo(f, k * 0.09, 0.16)).concat(duo(1319, 0.4, 0.5, 0.045), bell(1568, 0.4, 0.03))),
  levelUp: () =>
    play([392, 523, 659, 784, 1047].flatMap((f, k) => duo(f, k * 0.08, 0.14)).concat(duo(784, 0.48, 0.12), duo(1047, 0.6, 0.6, 0.05), bell(2093, 0.6, 0.025))),
  prayer: () => play([...bell(659, 0, 0.05), ...bell(988, 0.18, 0.035)]),
  tap: () => play([{ f: 880, to: 660, at: 0, len: 0.05, type: "triangle", vol: 0.04 }]),
  pop: () => play([{ f: 320, to: 760, at: 0, len: 0.09, type: "sine", vol: 0.06 }]),
  melody: () => play([523, 587, 659, 784, 659, 587, 523].flatMap((f, k) => duo(f, k * 0.17, 0.2, 0.045))),
  engine: () => play([{ f: 60, to: 150, at: 0, len: 0.7, type: "sawtooth", vol: 0.035 }, { f: 30, to: 75, at: 0, len: 0.7, type: "square", vol: 0.02 }]),
};
