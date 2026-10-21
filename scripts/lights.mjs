#!/usr/bin/env node
/**
 * Unsorted lights helper — the living-room lights follow the Mafia game.
 *
 * Run it on a computer at home, on the same Wi-Fi as the Philips WiZ lights:
 *   npm run lights            follow every game where the host turned on "Playing at Elita home"
 *   npm run lights -- --demo  show each scene for a few seconds, then put the lights back
 *   npm run lights -- --setup ask for the host code and the lights room again
 *   npm run lights -- --dry-run  follow the game but only print what it would do
 *
 * WiZ lights only listen on the local network (UDP port 38899), which is why this runs at
 * home instead of on the game server. It watches the game exactly like the TV screen does
 * (public information only), so it never knows anyone's role.
 */
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { io } from 'socket.io-client';
import { createAlexa } from './alexa.mjs';

const CONFIG_FILE = path.join(os.homedir(), '.unsorted-lights.json');
const DEFAULT_SERVER = 'https://mafia-night-1c5h.onrender.com';
const WIZ_PORT = 38899;
const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const serverArg = process.argv.find((a) => a.startsWith('--server='))?.slice('--server='.length);

// ------------------------------------------------------------------ scenes

/**
 * Cozy and dramatic: medium brightness throughout (never glaring, never pitch dark), a colour
 * per moment, and gentle movement. Each scene is a list of steps [params, hold ms]; `loop`
 * repeats the steps for as long as the game stays in that moment.
 * WiZ dimming runs 10–100 %; colours are r/g/b, temperatures in kelvin, sceneId = a WiZ scene.
 */
const RED = { r: 255, g: 0, b: 0 };
const SCENES = {
  // Lobby: the WiZ "Cozy" scene, half brightness — people arriving.
  lobby: { steps: [[{ sceneId: 6, speed: 60, dimming: 45 }, 0]] },
  // Role reveal: low mysterious violet.
  reveal: { steps: [[{ r: 110, g: 20, b: 190, dimming: 30 }, 0]] },
  // Dawn: a faint orange glow — still night-time, just the first hint of sun.
  dawn: { steps: [[{ r: 255, g: 80, b: 0, dimming: 10 }, 1200], [{ r: 255, g: 95, b: 10, dimming: 16 }, 0]] },
  // Night: deep red, slowly breathing.
  night: { loop: true, steps: [[{ ...RED, dimming: 30 }, 2600], [{ ...RED, dimming: 18 }, 2600]] },
  // Day: a low, warm, candle-like light — enough to see faces, cozy like the night.
  day: { steps: [[{ temp: 2200, dimming: 22 }, 0]] },
  // Vote: a crimson heartbeat.
  vote: { loop: true, steps: [[{ r: 220, g: 0, b: 50, dimming: 55 }, 160], [{ r: 220, g: 0, b: 50, dimming: 22 }, 220], [{ r: 220, g: 0, b: 50, dimming: 45 }, 160], [{ r: 220, g: 0, b: 50, dimming: 18 }, 900]] },
  // The pause on the vote's result: dark, still red.
  verdict: { steps: [[{ ...RED, dimming: 14 }, 0]] },
  // After the finale: party, then (after 45 s) back to normal.
  party: { steps: [[{ sceneId: 4, speed: 120, dimming: 60 }, 0]] },
};

/** One-off effects for the big moments, then the room returns to the current scene. */
const OFF = { r: 0, g: 0, b: 0, dimming: 10 }; // as dark as a bulb goes while staying "on"
const EFFECTS = {
  // Killed: a red strobe, a beat of darkness.
  kill: [[{ ...RED, dimming: 85 }, 120], [OFF, 110], [{ ...RED, dimming: 85 }, 120], [OFF, 110], [{ ...RED, dimming: 85 }, 160], [OFF, 900]],
  voteout: [[{ ...RED, dimming: 85 }, 260], [OFF, 300], [{ ...RED, dimming: 85 }, 260], [OFF, 300], [{ ...RED, dimming: 60 }, 700]],
  removed: [[{ ...RED, dimming: 70 }, 300], [OFF, 500]],
  // Brought back: darkness, then gold rising.
  revive: [[OFF, 600], [{ r: 255, g: 190, b: 60, dimming: 20 }, 500], [{ r: 255, g: 200, b: 70, dimming: 45 }, 600], [{ r: 255, g: 210, b: 90, dimming: 80 }, 1200]],
  // Saved: a soft green glow.
  saved: [[{ r: 30, g: 255, b: 90, dimming: 25 }, 400], [{ r: 30, g: 255, b: 90, dimming: 65 }, 900], [{ r: 30, g: 255, b: 90, dimming: 30 }, 500]],
  restored: [[{ r: 30, g: 255, b: 90, dimming: 60 }, 900]],
  // Silenced: a violet hush.
  silence: [[{ r: 140, g: 60, b: 255, dimming: 60 }, 700], [{ r: 140, g: 60, b: 255, dimming: 15 }, 1200]],
  // Theft: the lights flicker out and back.
  theft: [[OFF, 150], [{ r: 255, g: 255, b: 255, dimming: 30 }, 90], [OFF, 300], [{ r: 255, g: 255, b: 255, dimming: 30 }, 90], [OFF, 500]],
  // The Joker: a burst of party colours.
  joker: [[{ sceneId: 4, speed: 200, dimming: 70 }, 2800]],
};
/** After an even round: the lights pulse red once for every Mafia member still alive. */
const countPulse = (n) => Array.from({ length: Math.max(0, n) }, () => [[{ ...RED, dimming: 80 }, 280], [OFF, 420]]).flat();

function sceneFor(view) {
  if (!view) return null;
  if (view.status === 'lobby') return 'lobby';
  const phase = view.game?.phase;
  if (!phase) return 'lobby';
  return { reveal: 'reveal', prenight: 'dawn', night: 'night', morning: 'day', discussion: 'day', voting: 'vote', verdict: 'verdict', game_over: 'day' }[phase] ?? 'lobby';
}

// ------------------------------------------------------------------ WiZ (UDP)

const sock = dgram.createSocket('udp4');
const pending = new Map(); // ip -> resolve
sock.on('message', (buf, rinfo) => {
  let msg;
  try {
    msg = JSON.parse(buf.toString());
  } catch {
    return;
  }
  const r = pending.get(rinfo.address);
  if (r) {
    pending.delete(rinfo.address);
    r(msg);
  }
  if (discovering && msg?.result?.mac) discovering.set(rinfo.address, msg.result);
});
let discovering = null;
sock.on('error', (e) => console.log(`(network: ${e.message})`));
await new Promise((res) => sock.bind(0, () => (sock.setBroadcast(true), res())));

function send(ip, method, params = {}, tries = 3) {
  const payload = Buffer.from(JSON.stringify({ method, params }));
  return new Promise((resolve) => {
    let n = 0;
    const attempt = () => {
      n++;
      const t = setTimeout(() => {
        if (pending.get(ip) === done) pending.delete(ip);
        n < tries ? attempt() : resolve(null);
      }, 450);
      const done = (msg) => {
        clearTimeout(t);
        resolve(msg);
      };
      pending.set(ip, done);
      sock.send(payload, WIZ_PORT, ip);
    };
    attempt();
  });
}

function localSubnets() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address.split('.').slice(0, 3).join('.'));
  }
  return [...new Set(out)];
}

async function discover() {
  discovering = new Map();
  const payload = Buffer.from(JSON.stringify({ method: 'getSystemConfig', params: {} }));
  for (let round = 0; round < 2; round++) {
    sock.send(payload, WIZ_PORT, '255.255.255.255');
    for (const net of localSubnets()) for (let i = 1; i < 255; i++) sock.send(payload, WIZ_PORT, `${net}.${i}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  const found = [...discovering.entries()].map(([ip, r]) => ({ ip, mac: r.mac, roomId: r.roomId, module: r.moduleName ?? '' }));
  discovering = null;
  return found;
}

// ------------------------------------------------------------------ config

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}
function saveConfig(c) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2), { mode: 0o600 });
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const write = rl._writeToOutput.bind(rl);
      rl._writeToOutput = (s) => (s.startsWith(question) ? write(s) : write(s.replace(/[^\r\n]/g, '•')));
    }
    rl.question(question, (a) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(a.trim());
    });
  });
}

async function setup(config, { needCode }) {
  console.log('\n💡 Unsorted lights helper — one-time setup\n');
  if (needCode && (!config.hostCode || args.has('--setup'))) {
    config.hostCode = await ask('Host code (the one you use to open a room): ', { hidden: true });
  }
  if (config.wizRoomId !== undefined && !args.has('--setup')) {
    saveConfig(config);
    return config;
  }
  console.log('\nLooking for WiZ lights on this Wi-Fi…');
  const all = (await discover()).filter((d) => !/SOCKET/i.test(d.module));
  if (!all.length) {
    console.log('No WiZ lights found. Is this computer on the same Wi-Fi as the lights?');
    process.exit(1);
  }
  const rooms = new Map();
  for (const d of all) rooms.set(d.roomId, [...(rooms.get(d.roomId) ?? []), d]);
  const list = [...rooms.entries()].sort((a, b) => b[1].length - a[1].length);
  list.forEach(([id, ds], i) => console.log(`  ${i + 1}. WiZ room ${id}: ${ds.length} light(s)  ${ds.map((d) => d.ip).join(', ')}`));
  const pick = list.length === 1 ? '1' : await ask(`Which room is the living room? [1]: `);
  const chosen = list[Math.max(0, Math.min(list.length - 1, (Number(pick) || 1) - 1))];
  config.wizRoomId = chosen[0];
  saveConfig(config);
  console.log(`Saved. Using the ${chosen[1].length} light(s) in WiZ room ${chosen[0]}.\n`);
  return config;
}

// ------------------------------------------------------------------ the lights

let bulbs = []; // { ip, mac }
const original = new Map(); // mac -> getPilot result, taken the first time we take over
let current = null; // scene name in force
let wanted = null; // the scene the game is in right now (a flash returns to this)
let flashTimer = null;

async function refreshBulbs(roomId) {
  const found = (await discover()).filter((d) => d.roomId === roomId && !/SOCKET/i.test(d.module));
  if (found.length) {
    const was = bulbs.map((b) => b.mac).sort().join();
    // Keep a light we knew about even if it missed this one look (UDP replies can get lost).
    const merged = new Map(bulbs.map((b) => [b.mac, b]));
    for (const f of found) merged.set(f.mac, f);
    bulbs = [...merged.values()];
    if (bulbs.map((b) => b.mac).sort().join() !== was) console.log(`💡 Found ${bulbs.length} light(s) in the living room: ${bulbs.map((b) => b.ip).join(', ')}`);
  }
  return bulbs;
}

async function snapshot() {
  for (const b of bulbs) {
    if (original.has(b.mac)) continue;
    const r = await send(b.ip, 'getPilot');
    if (r?.result) original.set(b.mac, r.result);
  }
}

async function setAll(params, label) {
  if (DRY) return console.log(`   [dry-run] ${label}`, JSON.stringify(params));
  await Promise.all(bulbs.map((b) => send(b.ip, 'setPilot', { state: true, ...params })));
}

// Everything the lights do runs as one "show" at a time; starting a new one stops the old.
let showId = 0;
/** The living-room Echo (music + sound effects), when signed in. */
let alexa = null;
const MUSIC_FOR = { dawn: 'dawn', night: 'night', day: 'day', vote: 'vote' };
let phaseToken = ''; // changes every phase, so each new round gets a new song
let holdMusic = false; // a big announcement is about to play: the music waits for it
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runSteps(steps, id) {
  for (const [params, ms] of steps) {
    if (id !== showId) return false;
    await setAll(params, current ?? 'effect');
    if (ms) await sleep(ms);
  }
  return id === showId;
}

/** Hold a scene (looping its steps if it moves) until something else takes over. */
async function applyScene(name, { force = false } = {}) {
  if (!name || (!force && name === current)) return;
  current = name;
  const id = ++showId;
  console.log(`💡 ${new Date().toLocaleTimeString()}  ${name}`);
  if (alexa && !holdMusic) MUSIC_FOR[name] ? alexa.music(MUSIC_FOR[name], phaseToken) : name !== 'party' && alexa.pause();
  await snapshot();
  const sc = SCENES[name];
  do {
    if (!(await runSteps(sc.steps, id))) return;
  } while (sc.loop && id === showId);
}

/**
 * The countdown: the room's light blinks once a second for the last seconds of a timed phase
 * (5 s for Dawn, Night and the vote; 10 s for the discussion), then the scene comes back.
 */
const COUNTDOWN = { dawn: 5, night: 5, vote: 5, day: 10 };
let countdownTimer = null;
let countdownRan = ''; // the phase + end time whose countdown already started (never run twice)
function colourOf(name) {
  const p = SCENES[name]?.steps?.[0]?.[0] ?? {};
  if (p.sceneId !== undefined) return { temp: 3000 };
  const { dimming, ...c } = p;
  return c;
}
async function countdown(name, seconds) {
  const id = ++showId;
  current = null;
  console.log(`⏱️  ${name}: last ${seconds} s`);
  const c = colourOf(name);
  for (let i = 0; i < seconds; i++) {
    if (!(await runSteps([[{ ...c, dimming: 85 }, 220], [{ ...c, dimming: 12 }, 780]], id))) return;
  }
  if (id === showId) applyScene(wanted, { force: true });
}
function scheduleCountdown(view) {
  clearTimeout(countdownTimer);
  const g = view.game;
  const scene = sceneFor(view);
  const n = COUNTDOWN[scene];
  if (!g || !n || !g.phaseEndsAt || g.pausedRemainingMs !== null) return;
  const offset = (view.serverNow ?? Date.now()) - Date.now(); // server clock minus ours
  const startIn = g.phaseEndsAt - offset - n * 1000 - Date.now();
  const key = `${g.phaseSeq}:${g.phaseEndsAt}`;
  if (startIn < -500 || countdownRan === key) return;
  countdownTimer = setTimeout(() => {
    countdownRan = key;
    countdown(scene, n).catch(() => {});
  }, Math.max(0, startIn));
}

/** A one-off effect, then back to whatever the game is in now. */
async function effect(name, steps) {
  if (!steps?.length) return;
  const id = ++showId;
  current = null;
  console.log(`⚡ ${name}`);
  if (alexa) alexa.sfx(name in EFFECTS ? name : 'mafiacount');
  holdMusic = false; // after the effect, the scene (and its music) comes back
  await snapshot();
  if (await runSteps(steps, id)) applyScene(wanted, { force: true });
}
const flash = (tag) => effect(tag, EFFECTS[tag]);

/**
 * The game-over finale, in step with the TV and phones: the room goes dark and flickers like a
 * candle ("And the Mafia were…"), a red flash as each Mafia card turns, then the winner's light.
 */
const FIN = { suspenseAt: 2.4, suspenseFor: 3.0, mafiaStep: 0.9, specialStep: 0.45, villagerStep: 0.25, groupGap: 0.9, tail: 0.8 };
function finaleTimes(view) {
  const s = view.settings ?? {};
  const isMafiaSide = (id) => id === 'mafia' || id === 'godfather' || (id === 'imposter' && s.imposterAlignment === 'mafia');
  const players = view.players ?? [];
  const mafia = players.filter((p) => isMafiaSide(p.revealedRoleId));
  const villagers = players.filter((p) => !mafia.includes(p) && p.revealedRoleId === 'villager');
  const special = players.filter((p) => !mafia.includes(p) && !villagers.includes(p));
  let t = FIN.suspenseAt + FIN.suspenseFor;
  const mafiaAt = [];
  for (const [list, step, isMafia] of [[mafia, FIN.mafiaStep, true], [special, FIN.specialStep, false], [villagers, FIN.villagerStep, false]]) {
    if (!list.length) continue;
    list.forEach((_, i) => isMafia && mafiaAt.push(t + 0.35 + i * step));
    t += 0.35 + list.length * step + FIN.groupGap;
  }
  return { mafiaAt, end: t + FIN.tail };
}
async function finaleShow(view) {
  const id = ++showId;
  current = null;
  console.log('🎬 finale');
  if (alexa) alexa.pause();
  await snapshot();
  const { mafiaAt, end } = finaleTimes(view);
  const t0 = Date.now();
  const at = (sec) => sleep(Math.max(0, t0 + sec * 1000 - Date.now()));
  // The curtain: lights sink to a dim red.
  if (!(await runSteps([[{ ...RED, dimming: 25 }, 600], [{ ...RED, dimming: 12 }, 0]], id))) return;
  await at(FIN.suspenseAt);
  if (alexa && id === showId) alexa.sfx('suspense');
  // Suspense: a slow candle flicker.
  if (!(await runSteps([[{ sceneId: 29, speed: 80, dimming: 22 }, 0]], id))) return;
  for (const sec of mafiaAt) {
    await at(sec);
    if (!(await runSteps([[{ ...RED, dimming: 90 }, 220], [{ ...RED, dimming: 15 }, 0]], id))) return;
  }
  await at(end);
  const w = view.game?.winner?.faction;
  if (alexa && id === showId) alexa.sfx(w === 'mafia' ? 'winMafia' : 'winTown');
  const win =
    w === 'mafia'
      ? [[{ ...RED, dimming: 90 }, 200], [OFF, 200], [{ ...RED, dimming: 90 }, 200], [OFF, 200], [{ ...RED, dimming: 60 }, 3500]]
      : w === 'good'
        ? [[{ r: 255, g: 200, b: 90, dimming: 30 }, 400], [{ r: 255, g: 210, b: 110, dimming: 70 }, 3500]]
        : [[{ sceneId: 4, speed: 200, dimming: 70 }, 3500]];
  if (await runSteps(win, id)) applyScene('day', { force: true }); // back to daylight: the game is over
}

/** Put every light back exactly as it was before the game took over. */
async function restore() {
  showId++; // stop any scene or effect still running
  clearTimeout(countdownTimer);
  if (alexa) alexa.stop();
  if (!original.size) return;
  console.log('↩️  Putting the lights back the way they were');
  for (const b of bulbs) {
    const o = original.get(b.mac);
    if (!o) continue;
    const params = { state: !!o.state };
    if (o.state) {
      if (o.sceneId) params.sceneId = o.sceneId;
      else if (o.temp) params.temp = o.temp;
      else if (o.r !== undefined) Object.assign(params, { r: o.r, g: o.g, b: o.b });
      if (o.dimming) params.dimming = o.dimming;
      if (o.speed) params.speed = o.speed;
    }
    if (!DRY) await send(b.ip, 'setPilot', params);
  }
  original.clear();
  current = null;
}

// ------------------------------------------------------------------ demo

async function demo(config) {
  await refreshBulbs(config.wizRoomId);
  console.log(`Demo on ${bulbs.length} light(s): ${bulbs.map((b) => b.ip).join(', ')}`);
  for (const name of ['lobby', 'reveal', 'dawn', 'night', 'day', 'vote']) {
    applyScene(name, { force: true });
    await sleep(name === 'night' || name === 'vote' ? 6000 : 4000);
  }
  for (const [tag, back] of [['kill', 'day'], ['revive', 'day'], ['silence', 'day'], ['saved', 'day']]) {
    wanted = back;
    await effect(tag, EFFECTS[tag]);
    await sleep(2500);
  }
  wanted = 'verdict';
  await effect('2 Mafia left', countPulse(2));
  await sleep(1500);
  await finaleShow({ players: [{ revealedRoleId: 'mafia' }, { revealedRoleId: 'godfather' }, { revealedRoleId: 'doctor' }, { revealedRoleId: 'villager' }], settings: {}, game: { winner: { faction: 'good' } } });
  await sleep(4000);
  await restore();
  process.exit(0);
}

// ------------------------------------------------------------------ following the game

async function follow(config) {
  if (config.alexa?.cookieData) {
    alexa = createAlexa(config, saveConfig);
    if (!(alexa && (await alexa.start()))) alexa = null;
  }
  const server = (serverArg ?? config.server ?? DEFAULT_SERVER).replace(/\/$/, '');
  await refreshBulbs(config.wizRoomId);
  console.log(`💡 Lights helper running — ${bulbs.length} light(s) in the living room${DRY ? ' (dry run)' : ''}.`);
  console.log(`   Watching ${server} for games with “Playing at Elita home” turned on. Ctrl+C to stop.\n`);
  if (!bulbs.length) console.log('   (No lights answered yet — will keep looking.)');

  let room = null; // { code, socket, view, seq, overAt }
  let lastError = '';
  const leave = async () => {
    if (!room) return;
    room.socket.close();
    room = null;
    await restore();
  };

  const onView = async (view) => {
    if (!room) return;
    room.view = view;
    if (!view.settings?.homeLights) return leave();
    const g = view.game;
    const seq = view.status === 'lobby' ? -1 : (g?.phaseSeq ?? -1);
    const scene = sceneFor(view);
    wanted = scene;
    phaseToken = String(g?.round ?? 0); // one song per round
    if (alexa) alexa.setVolumes(view.settings?.musicVolume, view.settings?.sfxVolume);
    // The party is over and the lights are back to normal: leave them alone until the next game.
    scheduleCountdown(view); // re-aimed on every update (pause, +30 s, a new phase)
    if (seq !== room.seq) {
      const first = room.seq === undefined;
      room.seq = seq;
      room.overAt = g?.phase === 'game_over' && view.status !== 'lobby' ? (first ? Date.now() - 40_000 : Date.now()) : 0;
      // A new phase: the TV's curtain plays for ~2 s, then the big news lands — flash with it.
      const tags = first ? [] : (g?.news ?? []).map((n) => n.tag).filter((t) => t && (EFFECTS[t] || t === 'mafiacount'));
      clearTimeout(flashTimer); // a flash for a phase that's already over is skipped
      if (g?.phase === 'game_over' && !first) {
        finaleShow(view).catch(() => {});
        return;
      }
      // Big news: the dramatic sound plays first, the music after it (no queueing behind each other).
      holdMusic = tags.length > 0;
      if (alexa && holdMusic) alexa.pause();
      if (alexa && scene === 'reveal') alexa.intro();
      applyScene(scene).catch(() => {});
      if (tags.length) {
        // The kill/revive/… effect lands with the news (after the ~2 s curtain); after an even
        // round's vote, the lights also pulse once per Mafia member left.
        const left = view.game?.mafiaLeft && tags.includes('mafiacount') ? view.game.mafiaLeft.count : null;
        const main = tags.find((t) => EFFECTS[t]);
        const delay = g?.phase === 'verdict' ? 1500 : 2000;
        flashTimer = setTimeout(() => {
          const steps = [...(main ? EFFECTS[main] : []), ...(left !== null ? [[OFF, 1500], ...countPulse(left)] : [])];
          effect(main ?? 'mafia count', steps).catch(() => {});
        }, delay);
      }
    } else if (scene !== 'party' && current !== null) {
      applyScene(scene).catch(() => {});
    }
  };

  const join = (code) => {
    const socket = io(server, { auth: { code, display: true }, transports: ['websocket'], reconnection: true });
    room = { code, socket, view: null, seq: undefined, overAt: 0 };
    console.log(`🎮 Following room ${code}`);
    socket.on('state', (v) => onView(v).catch((e) => console.error(e)));
    socket.on('connect_error', (e) => {
      if (e.message === 'no_room') leave();
    });
  };

  const poll = async () => {
    try {
      const res = await fetch(`${server}/api/lights/rooms`, { headers: { 'x-host-code': config.hostCode ?? '' } });
      if (res.status === 401 || res.status === 403) {
        const msg = 'The host code was not accepted. Run: npm run lights -- --setup';
        if (msg !== lastError) console.log(msg);
        lastError = msg;
        return;
      }
      const { rooms = [] } = await res.json();
      lastError = '';
      // Follow the most recently active game (the server lists it first). An old, abandoned
      // game never takes the lights from tonight's.
      const want = rooms[0];
      if (room && !want) await leave();
      else if (room && want.code !== room.code) {
        room.socket.close(); // switch games without flickering back to normal in between
        room = null;
        join(want.code);
      } else if (!room && want) join(want.code);
      // Game over: party for a while, then the lights go back to normal.
    } catch (e) {
      const msg = `Can't reach the game server (${e.message}). Retrying…`;
      if (msg !== lastError) console.log(msg);
      lastError = msg;
    }
  };

  // Check often while a game is being followed; gently when nothing is happening (it runs all day).
  const loop = async () => {
    await poll();
    setTimeout(loop, room ? 8000 : 20_000);
  };
  await loop();
  // Bulbs can change address (the Wi-Fi hands them out); look often until we have them, then every 2 minutes.
  let lastLook = Date.now();
  setInterval(() => {
    const every = bulbs.length ? 120_000 : 15_000;
    if (Date.now() - lastLook < every) return;
    lastLook = Date.now();
    refreshBulbs(config.wizRoomId).catch(() => {});
  }, 5_000);
}

// ------------------------------------------------------------------ main

let config = loadConfig();
// Running in the background (started automatically): nobody can answer a question, so say what's
// missing and stop instead of waiting forever.
if (!process.stdin.isTTY && ((!args.has('--demo') && !config.hostCode) || config.wizRoomId === undefined)) {
  console.log('Not set up yet. Run once in Terminal:  npm run lights  (it asks for the host code), then restart the background helper.');
  process.exit(0);
}
const demoMode = args.has('--demo');
if (args.has('--alexa-login')) {
  // Sign in to Amazon once (in your own browser); the session is saved and used from then on.
  config.alexa = { ...(config.alexa ?? {}), cookieData: undefined };
  const a = createAlexa(config, (c) => {
    saveConfig(c);
    console.log('\n✅ Signed in to Amazon. Restart the background helper:  npm run lights:install');
    setTimeout(() => process.exit(0), 1500);
  });
  console.log('\n🔈 Open this in your browser and sign in to Amazon:  http://localhost:3001\n   (Amazon\'s own sign-in page — this helper never sees your password.)\n');
  await a?.start();
  await new Promise(() => {}); // wait for the sign-in
}
if ((!demoMode && !config.hostCode) || config.wizRoomId === undefined || args.has('--setup')) config = await setup(config, { needCode: !demoMode });

const stop = async () => {
  await restore();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

if (demoMode) await demo(config);
else await follow(config);
