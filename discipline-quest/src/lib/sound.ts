"use client";
/** Short 8-bit blips with WebAudio. Silent until the first tap, and only when sound is on. */
let ctx: AudioContext | null = null;

function ac() {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freqs: number[], step = 0.07, type: OscillatorType = "square", vol = 0.05) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime;
  freqs.forEach((f, i) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(vol, t0 + i * step);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (i + 1) * step);
    o.connect(g).connect(a.destination);
    o.start(t0 + i * step);
    o.stop(t0 + (i + 1) * step + 0.02);
  });
}

export const SFX = {
  coin: () => tone([988, 1319], 0.06),
  good: () => tone([523, 659, 784], 0.07),
  bad: () => tone([220, 165], 0.12, "sawtooth", 0.04),
  badge: () => tone([523, 659, 784, 1047, 784, 1047], 0.08),
  tap: () => tone([660], 0.03, "square", 0.03),
  melody: () => tone([523, 587, 659, 784, 659, 587, 523], 0.16, "triangle", 0.05),
  engine: () => tone([70, 80, 95, 120, 150], 0.12, "sawtooth", 0.035),
};
