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
/** The opening: only during the role card reveal, ~28 s, then the rounds use the playlist. */
export const INTRO = { command: 'play the shadow of death by justin vargas on spotify', seconds: 28 };
/** Phases with music (the discussion is quiet: people are talking). */
export const MUSIC = { reveal: true, dawn: true, night: true, vote: true };
/** Alexa built-in sound effects (only IDs from Amazon's own library play on an Echo). */
export const SFX = {
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
  let introId = 0;
  let musicOn = false; // music is currently playing (not paused)
  let musicKey = null; // the phase the current song belongs to
  let vol = { music: a.musicVolume ?? 35, sfx: a.sfxVolume ?? 70 };
  let volNow = null;
  const setVol = async (v) => {
    if (volNow === v) return;
    volNow = v;
    await cmd('volume', v);
  };
  const say = (text) => call((cb) => alexa.sendSequenceCommand(device.serialNumber, 'textCommand', text, cb));
  /** Load the playlist in silence (during the role reveal) so the first round starts instantly. */
  const preload = async () => {
    if (started) return;
    log('🎵 Loading Dramatic Suspense Mix (shuffled, silent)');
    await setVol(0);
    await say(PLAYLIST);
    await wait(2500);
    await cmd('shuffle', true).catch(() => {});
    await cmd('pause').catch(() => {});
    started = true;
    musicOn = false;
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
    /** Get the music ready without playing it (call when the game starts). */
    preload: () => q(async () => ready && preload()),
    /**
     * The role card reveal: "The Shadow of Death" for ~28 s, faded out, then the playlist is
     * loaded silently for the rounds. If the first round starts sooner, the rounds' music takes over.
     */
    intro: () =>
      q(async () => {
        if (!ready || started) return;
        log('🎵 Intro: The Shadow of Death (role reveal)');
        await setVol(vol.music);
        await say(INTRO.command);
        const mine = ++introId;
        setTimeout(() => {
          if (mine !== introId || started) return;
          q(async () => {
            if (started) return; // a round already began: its music is on
            await setVol(Math.round(vol.music / 2));
            await wait(600);
            await say('pause'); // the intro fades out; round one starts the playlist
            musicOn = false;
          });
        }, INTRO.seconds * 1000);
      }),
    /** Music for a phase of round `token`: the round's song resumes; a new round starts the next song. */
    music: (key, token = key) =>
      q(async () => {
        if (!ready || !MUSIC[key]) return;
        if (musicOn && musicKey === token) return;
        await setVol(vol.music);
        if (!started) {
          // Round one: start the playlist fresh, shuffled, on a random song from its beginning.
          log(`🎵 round ${token}: playlist starts`);
          await say(PLAYLIST);
          await wait(2500);
          await cmd('shuffle', true).catch(() => {});
          await cmd('next').catch(() => {});
          started = true;
          musicOn = true;
        } else if (musicKey !== null && musicKey !== token) {
          log(`🎵 round ${token}: next song`);
          await cmd('next'); // a new song, from its beginning
          musicOn = true;
        } else if (!musicOn) {
          await say('resume'); // Alexa's own "resume" continues the song from where it stopped
          musicOn = true;
        }
        musicKey = token;
      }),
    pause: () =>
      q(async () => {
        if (!ready || !musicOn) return;
        musicOn = false;
        await say('pause');
      }),
    /**
     * A sound effect. The music is NOT stopped: Alexa ducks it under the effect and carries on
     * by itself from the same point (stopping it ourselves made Spotify restart the song).
     */
    sfx: (name) =>
      q(async () => {
        if (!ready || !SFX[name]) return;
        log(`🔊 ${name}`);
        const back = musicOn ? vol.music : null;
        await setVol(vol.sfx);
        await call((cb) => alexa.sendSequenceCommand(device.serialNumber, 'sound', SFX[name], cb));
        if (back !== null) {
          await wait(3500);
          await setVol(back);
        }
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
