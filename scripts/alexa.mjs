/**
 * Alexa for the home helper: suspense music on the living-room Echo (Spotify through Alexa)
 * and Alexa sound effects for the big moments — over Wi-Fi, through the Amazon account.
 *
 * Signing in: `npm run lights -- --alexa-login` opens a local page that shows Amazon's own
 * sign-in; you sign in there yourself (the helper never sees or stores your password — only
 * the session Amazon hands back, saved in ~/.unsorted-lights.json, readable only by you).
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * The music: the "Dramatic Suspense Mix" Spotify playlist, shuffled. ONE song per round,
 * from its beginning: it plays through Dawn, Night and the vote, pauses for the discussion and
 * for every dramatic sound, and carries on from the same point. The next round moves to the
 * next song.
 */
export const PLAYLIST = 'play my playlist dramatic suspense mix on spotify';
/** Phases with music (the discussion is quiet: people are talking). */
export const MUSIC = { reveal: true, dawn: true, night: true, vote: true };
/** Alexa built-in sound effects (only IDs from Amazon's own library play on an Echo). */
export const SFX = {
  superpower: 'halloween_crows', // the Godfather's Superpower: a storm of crows
  kill: 'halloween_wolf', // a howl in the night
  voteout: 'horror_10', // a creaking door shuts
  removed: 'horror_10',
  revive: 'holiday_halloween_ghost', // back from the dead
  silence: 'halloween_footsteps',
  saved: 'amzn_sfx_church_bell_1x_02',
  restored: 'amzn_sfx_church_bell_1x_02',
  theft: 'squeaky_12',
  joker: 'boing_01',
  mafiacount: 'clock_01', // ticking: they are still among you
  suspense: 'halloween_wind', // the finale begins
  winTown: 'amzn_sfx_church_bell_1x_02', // the reveal ends: a bell tolls (no cheering)
  winMafia: 'halloween_crows',
};

export function createAlexa(config, save, log = console.log) {
  let Alexa;
  try {
    Alexa = require('alexa-remote2');
  } catch {
    log('🔈 Alexa: the alexa-remote2 package is missing (run npm run lights:install).');
    return null;
  }
  const a = config.alexa ?? {};
  const alexa = new Alexa();
  let ready = false;
  let device = null;
  // Every Echo call gives up after 4 s, so nothing in the game ever waits on a slow reply; each
  // call's time is logged (⏱) so delays can be seen in the helper's log.
  let failures = 0;
  const call = (fn, label = 'alexa') =>
    new Promise((res, rej) => {
      const t0 = Date.now();
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        log(`⏱ ${label}: no reply after 4 s (carrying on)`);
        res(null);
      }, 4000);
      fn((err, r) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const ms = Date.now() - t0;
        if (ms > 1200) log(`⏱ ${label}: slow reply (${ms} ms)`);
        if (err) {
          failures++;
          if (failures >= 3) reconnect();
          return rej(err);
        }
        failures = 0;
        res(r);
      });
    });
  let reconnecting = false;
  const reconnect = () => {
    if (reconnecting) return;
    reconnecting = true;
    ready = false;
    log('🔈 Alexa: connection problems — reconnecting…');
    setTimeout(async () => {
      try {
        await start();
      } finally {
        reconnecting = false;
        failures = 0;
      }
    }, 5000);
  };

  const opts = {
    proxyOnly: true,
    proxyOwnIp: 'localhost',
    proxyPort: 3001,
    proxyLogLevel: 'warn',
    amazonPage: a.amazonPage ?? 'amazon.in',
    alexaServiceHost: a.alexaServiceHost ?? `alexa.${a.amazonPage ?? 'amazon.in'}`,
    acceptLanguage: 'en-IN',
    useWsMqtt: false,
    usePushConnectType: 0,
    cookieRefreshInterval: 4 * 24 * 60 * 60 * 1000,
    logger: process.env.ALEXA_DEBUG ? log : undefined,
  };
  if (a.cookieData) {
    opts.cookie = a.cookieData;
    opts.formerRegistrationData = a.cookieData;
  }
  alexa.on('cookie', () => {
    config.alexa = { ...(config.alexa ?? {}), cookieData: alexa.cookieData };
    save(config);
  });

  const start = () =>
    new Promise((resolve) => {
      alexa.init(opts, (err) => {
        if (err) {
          if (String(err.message ?? err).includes('3001')) log('🔈 Alexa: sign in first — open http://localhost:3001 in your browser and sign in to Amazon.');
          else log(`🔈 Alexa: ${err.message ?? err}`);
          return resolve(false);
        }
        const all = Object.values(alexa.serialNumbers ?? {});
        const want = (a.device ?? 'Living Room Alexa').toLowerCase();
        device = all.find((d) => (d.accountName ?? '').toLowerCase() === want) ?? all.find((d) => (d.accountName ?? '').toLowerCase().includes('living'));
        if (!device) {
          log(`🔈 Alexa: signed in, but no Echo called “${a.device ?? 'Living Room Alexa'}”. Found: ${all.map((d) => d.accountName).join(', ')}`);
          return resolve(false);
        }
        ready = true;
        log(`🔈 Alexa: connected to “${device.accountName}”.`);
        resolve(true);
      });
    });

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const cmd = (c, v = null) => call((cb) => alexa.sendCommand(device.serialNumber, c, v, cb), c);
  const say = (text) => call((cb) => alexa.sendSequenceCommand(device.serialNumber, 'textCommand', text, cb), text.slice(0, 24));
  // Keep the connection warm: the first command after a long idle used to take ~60 s while Amazon
  // re-checked the sign-in. A harmless check every 2 minutes means game commands are never "cold".
  setInterval(() => {
    if (!ready) return;
    call((cb) => alexa.getDevices(cb), 'keep-warm').catch(() => {});
  }, 2 * 60_000).unref?.();
  let started = false; // the playlist has been put on this session
  let musicOn = false; // music is playing right now
  let musicKey = null; // the round whose song is loaded
  let vol = { music: a.musicVolume ?? 35, sfx: a.sfxVolume ?? 70 };
  let volNow = null;
  let sfxUntil = 0; // an effect is playing at the effects volume until then
  const setVol = async (v) => {
    if (volNow === v) return;
    volNow = v;
    await cmd('volume', v);
  };

  /*
   * The music is a small state machine. The game says what it WANTS (music on for round N, or
   * off); one worker brings the Echo there with fast direct commands (pause / play / next, each
   * ~0.3 s). If the game moves on while a command is in flight, the worker goes straight to the
   * newest wish — there is never a backlog of stale commands (that is what made it lag).
   */
  let want = { on: false, token: null };
  let busy = false;
  let dirty = false;
  const apply = async (w) => {
    if (!w.on) {
      if (musicOn) {
        musicOn = false;
        await cmd('pause');
      }
      return;
    }
    if (Date.now() >= sfxUntil) await setVol(vol.music);
    if (!started) {
      // The first song: the playlist, shuffled, on a random song from its beginning.
      log(`🎵 round ${w.token}: playlist starts`);
      await say(PLAYLIST);
      await wait(2200);
      await cmd('shuffle', true).catch(() => {});
      await cmd('next').catch(() => {});
      started = true;
      musicOn = true;
      musicKey = w.token;
      return;
    }
    if (musicKey !== w.token) {
      log(`🎵 round ${w.token}: next song`);
      musicKey = w.token;
      await cmd('next'); // a new song, from its beginning
      if (!musicOn) await cmd('play');
      musicOn = true;
      return;
    }
    if (!musicOn) {
      musicOn = true;
      await cmd('play'); // the same song carries on where it paused
    }
  };
  const reconcile = async () => {
    if (busy) {
      dirty = true;
      return;
    }
    busy = true;
    try {
      do {
        dirty = false;
        await apply({ ...want }).catch((e) => log(`🔈 Alexa: ${e?.message ?? e}`));
      } while (dirty);
    } finally {
      busy = false;
    }
  };

  const api = {
    start,
    get ready() {
      return ready;
    },
    devices: () => Object.values(alexa.serialNumbers ?? {}).map((d) => d.accountName),
    /** Wake the connection up now (a game is about to start). */
    warm: () => ready && call((cb) => alexa.getDevices(cb), 'warm-up').catch(() => {}),
    /** Music and effect volumes (0–100), from the host's sliders. */
    setVolumes: (music, sfx) => {
      if (!ready) return;
      const changed = music !== undefined && music !== vol.music;
      vol = { music: music ?? vol.music, sfx: sfx ?? vol.sfx };
      if (changed && musicOn && Date.now() >= sfxUntil) setVol(vol.music).catch(() => {});
    },
    volume: (v) => ready && setVol(v).catch(() => {}),
    /** Music for a phase of round `token`: the round's song resumes; a new round starts the next song. */
    music: (key, token = key) => {
      if (!ready) return;
      want = MUSIC[key] ? { on: true, token } : { ...want, on: false };
      reconcile();
    },
    pause: () => {
      if (!ready) return;
      want = { ...want, on: false };
      reconcile();
    },
    /**
     * A sound effect — sent at once, never queued behind the music. Alexa plays it over the
     * music (ducking it) and the music carries on by itself.
     */
    sfx: (name) => {
      if (!ready || !SFX[name]) return;
      log(`🔊 ${name}`);
      sfxUntil = Date.now() + 3500;
      (async () => {
        if (vol.sfx !== volNow) await setVol(vol.sfx).catch(() => {});
        await call((cb) => alexa.sendSequenceCommand(device.serialNumber, 'sound', SFX[name], cb), `sound ${name}`);
        await wait(3500);
        if (Date.now() >= sfxUntil && musicOn) await setVol(vol.music).catch(() => {});
      })().catch((e) => log(`🔈 Alexa: ${e?.message ?? e}`));
    },
    say: (text) => ready && call((cb) => alexa.sendSequenceCommand(device.serialNumber, 'speak', text, cb)),
    /** Any Alexa command, as if spoken (testing). */
    command: (text) => ready && say(text),
    /** The game is over / left: music off, and the next game starts the playlist afresh. */
    stop: () => {
      if (!ready) return;
      want = { on: false, token: null };
      started = false;
      musicKey = null;
      reconcile();
    },
  };
  return api;
}
