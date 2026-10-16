/**
 * Synthesised sound design — no audio files to download.
 *
 * ANTI-CHEAT: cues fire only on PUBLIC events (phase changes, verdicts, game over)
 * or on actions EVERY player performs (locking in, voting), so every phone sounds
 * the same and a sound never reveals a role.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let reverb: ConvolverNode | null = null;
let volume = 0.8;

function impulse(a: AudioContext, seconds: number, decay: number) {
  const len = Math.floor(a.sampleRate * seconds);
  const buf = a.createBuffer(2, len, a.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(comp).connect(ctx.destination);
      reverb = ctx.createConvolver();
      reverb.buffer = impulse(ctx, 2.4, 2.6);
      const wet = ctx.createGain();
      wet.gain.value = 0.32;
      reverb.connect(wet).connect(master);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  wet?: boolean;
  slideTo?: number;
  filter?: number;
}

function tone(freq: number, start: number, dur: number, o: ToneOpts = {}) {
  const a = ac();
  if (!a || !master) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t0 + dur);
  const peak = o.gain ?? 0.08;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.02));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node: AudioNode = osc.connect(g);
  if (o.filter) {
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.filter;
    node = node.connect(f);
  }
  node.connect(master);
  if (o.wet !== false && reverb) node.connect(reverb);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** Bell-like strike: fundamental plus inharmonic partials. */
function bell(freq: number, start: number, gain = 0.06, dur = 2.4) {
  tone(freq, start, dur, { type: 'sine', gain, attack: 0.005 });
  tone(freq * 2.76, start, dur * 0.6, { type: 'sine', gain: gain * 0.35, attack: 0.005 });
  tone(freq * 5.4, start, dur * 0.3, { type: 'sine', gain: gain * 0.15, attack: 0.005 });
}

function noiseBurst(start: number, dur: number, gain: number, cutoff: number) {
  const a = ac();
  if (!a || !master) return;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  if (reverb) g.connect(reverb);
  src.start(a.currentTime + start);
}

export const sounds = {
  /** Dawn: soft rising chimes. */
  dawn() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(f, i * 0.16, 0.035, 2));
  },
  /** Night: low drone, a distant bell and a falling wind. */
  night() {
    tone(55, 0, 3.2, { type: 'sawtooth', gain: 0.05, attack: 0.6, filter: 220 });
    tone(82.4, 0.1, 3, { type: 'sine', gain: 0.06, attack: 0.5 });
    bell(196, 0.4, 0.05, 3);
    noiseBurst(0.2, 2.2, 0.05, 600);
  },
  /** Day: a warm major swell. */
  day() {
    [261.63, 329.63, 392, 523.25].forEach((f, i) => tone(f, i * 0.05, 2.2, { type: 'triangle', gain: 0.045, attack: 0.35 }));
    bell(1046.5, 0.5, 0.025, 1.6);
  },
  /** A vote result: gavel knock and a low boom. */
  verdict() {
    noiseBurst(0, 0.18, 0.35, 1800);
    tone(70, 0, 1.4, { type: 'sine', gain: 0.18, attack: 0.005, slideTo: 40 });
    noiseBurst(0.32, 0.18, 0.25, 1500);
  },
  /** Game over: a short brass-like fanfare (the same for winners and losers). */
  gameOver() {
    const seq: [number, number][] = [
      [392, 0],
      [523.25, 0.18],
      [659.25, 0.36],
      [783.99, 0.6],
    ];
    for (const [f, t] of seq) {
      tone(f, t, 1.2, { type: 'sawtooth', gain: 0.03, attack: 0.03, filter: 2400 });
      tone(f / 2, t, 1.2, { type: 'triangle', gain: 0.03, attack: 0.03 });
    }
    bell(1567.98, 0.9, 0.03, 2.4);
  },
  /** Locking in / casting a vote — every player does this, so it is safe. */
  seal() {
    tone(880, 0, 0.12, { type: 'triangle', gain: 0.04, wet: false });
    tone(1318.5, 0.06, 0.25, { type: 'sine', gain: 0.03 });
  },
  /** Last seconds of a timer. */
  tick() {
    tone(1200, 0, 0.05, { type: 'square', gain: 0.012, wet: false, filter: 3000 });
  },
  setVolume(v: number) {
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = volume;
  },
  /** Browsers only allow audio after a tap; call on the first interaction. */
  unlock() {
    ac();
  },
};
