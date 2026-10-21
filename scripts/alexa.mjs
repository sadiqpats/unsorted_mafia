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

/** What plays when (Spotify search phrases) and the sound effect for each event. */
export const MUSIC = {
  dawn: 'suspense thriller background music',
  night: 'dark suspense horror ambience',
  day: 'mystery investigation background music',
  vote: 'tense countdown suspense music',
};
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
  let playing = null; // which music phrase is on
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

  const api = {
    start,
    get ready() {
      return ready;
    },
    devices: () => Object.values(alexa.serialNumbers ?? {}).map((d) => d.accountName),
    volume: (v) => q(() => ready && call((cb) => alexa.sendCommand(device.serialNumber, 'volume', v, cb))),
    /** Play a Spotify search (no-op if that music is already on). */
    music: (key) =>
      q(async () => {
        if (!ready || !MUSIC[key] || playing === key) return;
        playing = key;
        log(`🎵 ${key}: “${MUSIC[key]}”`);
        await call((cb) => alexa.playMusicProvider(device.serialNumber, a.provider ?? 'SPOTIFY', MUSIC[key], cb));
      }),
    pause: () =>
      q(async () => {
        if (!ready || !playing) return;
        playing = null;
        await call((cb) => alexa.sendCommand(device.serialNumber, 'pause', null, cb));
      }),
    /** A sound effect (music pauses for it; the caller starts music again after). */
    sfx: (name) =>
      q(async () => {
        if (!ready || !SFX[name]) return;
        if (playing) {
          playing = null;
          await call((cb) => alexa.sendCommand(device.serialNumber, 'pause', null, cb)).catch(() => {});
        }
        log(`🔊 ${name}`);
        await call((cb) => alexa.sendSequenceCommand(device.serialNumber, 'sound', SFX[name], cb));
      }),
    say: (text) => q(() => ready && call((cb) => alexa.sendSequenceCommand(device.serialNumber, 'speak', text, cb))),
    stop: () =>
      q(async () => {
        if (!ready) return;
        playing = null;
        await call((cb) => alexa.sendCommand(device.serialNumber, 'pause', null, cb)).catch(() => {});
      }),
  };
  return api;
}
