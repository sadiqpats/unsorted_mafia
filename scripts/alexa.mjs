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
 * The music: one Spotify playlist (saved in the Spotify library linked to Alexa), shuffled.
 * Every new phase jumps to a different random song and starts it part-way through, so it
 * never sounds like the same intro twice.
 */
export const PLAYLIST = 'play my playlist dramatic suspense mix on spotify';
/** Phases that have music (the others are quiet). */
export const MUSIC = { dawn: true, night: true, day: true, vote: true };
/** Alexa sound library effects (soundStringId), played between music. */
export const SFX = {
  kill: 'amzn_sfx_scifi_explosion_2x_01',
  voteout: 'amzn_sfx_trumpet_bugle_04',
  revive: 'amzn_sfx_magic_blast_1x_01',
  silence: 'amzn_sfx_church_bell_1x_02',
  saved: 'amzn_sfx_magic_blast_1x_01',
  joker: 'amzn_sfx_drum_comedy_01',
  mafiacount: 'amzn_sfx_church_bell_1x_02',
  suspense: 'amzn_sfx_scifi_alarm_01',
  winTown: 'amzn_sfx_large_crowd_cheer_01',
  winMafia: 'amzn_sfx_scifi_explosion_2x_01',
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
  let queue = Promise.resolve();
  const q = (fn) => (queue = queue.then(fn).catch((e) => log(`🔈 Alexa: ${e?.message ?? e}`)));
  const call = (fn) => new Promise((res, rej) => fn((err, r) => (err ? rej(err) : res(r))));

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
  const rnd = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const cmd = (c, v = null) => call((cb) => alexa.sendCommand(device.serialNumber, c, v, cb));
  let started = false; // the playlist has been put on this session
  let musicOn = false; // music is currently playing (not paused)
  let musicKey = null; // the phase the current song belongs to
  let vol = { music: a.musicVolume ?? 35, sfx: a.sfxVolume ?? 70 };
  let volNow = null;
  const setVol = async (v) => {
    if (volNow === v) return;
    volNow = v;
    await cmd('volume', v);
  };
  /** Jump to a random song in the (shuffled) playlist and start it part-way through. */
  const randomSpot = async () => {
    for (let i = rnd(1, 4); i > 0; i--) {
      await cmd('next');
      await wait(700);
    }
    await wait(1500);
    for (let i = rnd(2, 5); i > 0; i--) {
      await cmd('forward'); // skips ahead ~30 s
      await wait(500);
    }
  };

  const api = {
    start,
    get ready() {
      return ready;
    },
    devices: () => Object.values(alexa.serialNumbers ?? {}).map((d) => d.accountName),
    /** Music and effect volumes (0–100), from the host's sliders. */
    setVolumes: (music, sfx) =>
      q(async () => {
        if (!ready) return;
        vol = { music: music ?? vol.music, sfx: sfx ?? vol.sfx };
        if (musicOn) await setVol(vol.music);
      }),
    volume: (v) => q(() => ready && setVol(v)),
    /** Music for a phase: a new phase gets a new random song; the same phase just carries on. */
    music: (key, token = key) =>
      q(async () => {
        if (!ready || !MUSIC[key]) return;
        if (musicOn && musicKey === token) return;
        await setVol(vol.music);
        if (!started) {
          log('🎵 Dramatic Suspense Mix (shuffled)');
          await call((cb) => alexa.sendSequenceCommand(device.serialNumber, 'textCommand', PLAYLIST, cb));
          await wait(4000);
          await cmd('shuffle', true).catch(() => {});
          started = true;
          musicOn = true;
          musicKey = token;
          await randomSpot();
          return;
        }
        if (!musicOn) {
          await cmd('play');
          musicOn = true;
          await wait(800);
        }
        if (musicKey !== token) {
          log(`🎵 ${key}: a different song`);
          musicKey = token;
          await randomSpot();
        }
      }),
    pause: () =>
      q(async () => {
        if (!ready || !musicOn) return;
        musicOn = false;
        await cmd('pause');
      }),
    /** A sound effect: music pauses for it (louder volume for the effect); the caller restarts music after. */
    sfx: (name) =>
      q(async () => {
        if (!ready || !SFX[name]) return;
        if (musicOn) {
          musicOn = false;
          await cmd('pause').catch(() => {});
        }
        await setVol(vol.sfx);
        log(`🔊 ${name}`);
        await call((cb) => alexa.sendSequenceCommand(device.serialNumber, 'sound', SFX[name], cb));
      }),
    say: (text) => q(() => ready && call((cb) => alexa.sendSequenceCommand(device.serialNumber, 'speak', text, cb))),
    /** Any Alexa command, as if spoken (testing). */
    command: (text) => q(() => ready && call((cb) => alexa.sendSequenceCommand(device.serialNumber, 'textCommand', text, cb))),
    stop: () =>
      q(async () => {
        if (!ready) return;
        musicOn = false;
        started = false;
        musicKey = null;
        await cmd('pause').catch(() => {});
      }),
  };
  return api;
}
