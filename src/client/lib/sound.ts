/**
 * Tiny Web Audio synth — no audio files. IMPORTANT for anti-cheat: sounds are
 * only ever triggered by PUBLIC events (phase changes), identically on every
 * phone, never by anything role-specific.
 */
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.06) {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + start + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.05);
}

export const sounds = {
  night() {
    tone(110, 0, 2.2, 'sine', 0.08);
    tone(164.8, 0.15, 2, 'sine', 0.04);
  },
  morning() {
    tone(523.3, 0, 1.2, 'triangle', 0.05);
    tone(659.3, 0.2, 1.2, 'triangle', 0.04);
    tone(784, 0.4, 1.5, 'triangle', 0.035);
  },
  vote() {
    tone(220, 0, 0.5, 'square', 0.025);
    tone(220, 0.6, 0.5, 'square', 0.025);
  },
  verdict() {
    tone(98, 0, 1.6, 'sawtooth', 0.04);
  },
  tick() {
    tone(880, 0, 0.08, 'square', 0.015);
  },
  unlock() {
    ac();
  },
};
