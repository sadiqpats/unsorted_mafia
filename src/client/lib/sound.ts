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

/**
 * The reverb's impulse response is built in small slices across idle moments
 * (instead of one ~100k-sample loop) so creating the audio engine never stalls an
 * animation. Tones play dry until it's ready (a fraction of a second).
 */
function buildReverb(a: AudioContext, into: ConvolverNode, seconds: number, decay: number) {
  const len = Math.floor(a.sampleRate * seconds);
  const buf = a.createBuffer(2, len, a.sampleRate);
  const chans = [buf.getChannelData(0), buf.getChannelData(1)];
  const SLICE = 12_000;
  let i = 0;
  const step = () => {
    const end = Math.min(len, i + SLICE);
    for (; i < end; i++) {
      const env = Math.pow(1 - i / len, decay);
      chans[0][i] = (Math.random() * 2 - 1) * env;
      chans[1][i] = (Math.random() * 2 - 1) * env;
    }
    if (i < len) setTimeout(step, 0);
    else into.buffer = buf;
  };
  setTimeout(step, 0);
}

function ac(resume = true): AudioContext | null {
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
      buildReverb(ctx, reverb, 1.8, 2.6);
      const wet = ctx.createGain();
      wet.gain.value = 0.34;
      reverb.connect(wet).connect(master);
    }
    if (resume && ctx.state === 'suspended') void ctx.resume();
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

/** Howling wind: noise through a slowly sweeping band-pass filter. */
function wind(start: number, dur: number, gain = 0.12) {
  const a = ac();
  if (!a || !master) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 6;
  const t0 = a.currentTime + start;
  f.frequency.setValueAtTime(280, t0);
  f.frequency.exponentialRampToValueAtTime(900, t0 + dur * 0.45);
  f.frequency.exponentialRampToValueAtTime(360, t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  if (reverb) g.connect(reverb);
  src.start(t0);
}


// ------------------------------------------------------------------ Bollywood kit (Dumb Charades)

/** Dhol / tabla hit: a pitched skin (sine with a fast pitch drop) plus a slap of noise. */
function drum(start: number, pitch: number, gain = 0.22, slap = 0.08) {
  tone(pitch, start, 0.35, { type: 'sine', gain, attack: 0.002, slideTo: pitch * 0.55, wet: false });
  noiseBurst(start, 0.06, slap, 2600);
}

/** Shehnai-ish reed: a nasal sawtooth through a band-pass, with vibrato. */
function reed(freq: number, start: number, dur: number, gain = 0.05, slideTo?: number) {
  const a = ac();
  if (!a || !master) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  const lfo = a.createOscillator();
  const depth = a.createGain();
  lfo.frequency.value = 5.5;
  depth.gain.value = freq * 0.012;
  lfo.connect(depth).connect(osc.frequency);
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = Math.min(4000, freq * 2.2);
  bp.Q.value = 2.2;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.04);
  g.gain.setValueAtTime(gain, t0 + Math.max(0.05, dur - 0.08));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(bp).connect(g).connect(master);
  if (reverb) g.connect(reverb);
  osc.start(t0);
  lfo.start(t0);
  osc.stop(t0 + dur + 0.05);
  lfo.stop(t0 + dur + 0.05);
}

/** Sad trombone: a muted brass slide. */
function brass(freq: number, start: number, dur: number, slideTo: number, gain = 0.07) {
  tone(freq, start, dur, { type: 'sawtooth', gain, attack: 0.05, slideTo, filter: 900 });
  tone(freq / 2, start, dur, { type: 'triangle', gain: gain * 0.6, attack: 0.05, slideTo: slideTo / 2 });
}

export const sounds = {
  /**
   * The welcome: haunted, then inviting. Wind, a creaking door, a distant bell,
   * a dark choir chord that resolves into a warm major chord, and a sparkle.
   */
  welcome() {
    wind(0, 3.2, 0.1);
    tone(98, 0.05, 1.1, { type: 'sawtooth', gain: 0.035, attack: 0.15, slideTo: 64, filter: 650 });
    bell(110, 0.25, 0.09, 3.5);
    [220, 261.63, 329.63].forEach((f) => tone(f, 0.45, 2.1, { type: 'triangle', gain: 0.035, attack: 0.9 }));
    tone(55, 0.45, 2.4, { type: 'sine', gain: 0.07, attack: 0.8 });
    [220, 277.18, 329.63, 440].forEach((f) => tone(f, 1.95, 2.8, { type: 'triangle', gain: 0.04, attack: 0.45 }));
    [1318.5, 1568, 2093, 2637].forEach((f, i) => bell(f, 2.15 + i * 0.09, 0.022, 1.6));
  },

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
  // ---------------------------------------------------------------- Dumb Charades
  /** Clapperboard + "Action!" dhol roll: the card is flipped and the clock starts. */
  action() {
    noiseBurst(0, 0.05, 0.5, 5000);
    noiseBurst(0.02, 0.04, 0.3, 1200);
    [0.18, 0.3, 0.42, 0.5, 0.58, 0.66].forEach((t, i) => drum(t, i % 2 ? 220 : 140, 0.18));
    reed(587.33, 0.7, 0.5, 0.04, 880);
  },
  /** "Sahi jawab!" — dhol beat under a happy shehnai run, and a sparkle. */
  filmyWin() {
    const beat = [0, 0.12, 0.24, 0.42, 0.54, 0.66, 0.84, 0.96, 1.08, 1.26];
    beat.forEach((t, i) => drum(t, i % 3 === 0 ? 110 : 190, i % 3 === 0 ? 0.26 : 0.16));
    // Sa Re Ga Pa Dha Sa' (D major-ish raag run) then a held high note.
    const run = [587.33, 659.25, 739.99, 880, 987.77, 1174.66];
    run.forEach((f, i) => reed(f, 0.1 + i * 0.11, 0.16, 0.05));
    reed(1174.66, 0.78, 0.7, 0.055, 1318.5);
    [1568, 2093, 2637, 3136].forEach((f, i) => bell(f, 1.2 + i * 0.07, 0.02, 1.2));
  },
  /** "Arre yaar…" — a sad trombone, wah-wah-wah-waaah, and one low tabla. */
  filmySad() {
    brass(311.13, 0, 0.32, 293.66);
    brass(293.66, 0.36, 0.32, 277.18);
    brass(277.18, 0.72, 0.32, 261.63);
    brass(261.63, 1.08, 1.1, 196);
    drum(1.1, 90, 0.22, 0.04);
  },
  /** Time's up: a big temple gong. */
  gong() {
    bell(98, 0, 0.16, 4);
    bell(146.83, 0.01, 0.06, 3);
    noiseBurst(0, 0.5, 0.08, 900);
  },
  /** A card swapped away. */
  whoosh() {
    const a = ac();
    if (!a) return;
    noiseBurst(0, 0.35, 0.12, 2400);
    tone(400, 0, 0.3, { type: 'sine', gain: 0.03, slideTo: 1400, wet: false });
  },
  /** Last ten seconds: a tabla "ta". */
  tabla() {
    drum(0, 330, 0.12, 0.05);
  },
  /** Winner announced: a full filmy fanfare with dhol. */
  filmyFanfare() {
    [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.05, 1.2, 1.35, 1.5].forEach((t, i) => drum(t, i % 2 ? 200 : 120, 0.2));
    const tune: [number, number, number][] = [
      [587.33, 0, 0.2],
      [739.99, 0.2, 0.2],
      [880, 0.4, 0.4],
      [987.77, 0.8, 0.2],
      [880, 1.0, 0.2],
      [1174.66, 1.2, 0.9],
    ];
    for (const [f, t, d] of tune) {
      reed(f, t, d, 0.05);
      tone(f, t, d + 0.3, { type: 'triangle', gain: 0.03, attack: 0.02 });
    }
    [1568, 2093, 2637, 3136, 3520].forEach((f, i) => bell(f, 1.5 + i * 0.08, 0.025, 1.6));
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
  /**
   * Build the audio graph (reverb impulse etc.) ahead of time without starting it —
   * browsers only let it start on a tap. Doing this early keeps that first tap instant.
   */
  prime() {
    ac(false);
  },
};
