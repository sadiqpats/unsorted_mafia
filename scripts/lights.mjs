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

const CONFIG_FILE = path.join(os.homedir(), '.unsorted-lights.json');
const DEFAULT_SERVER = 'https://mafia-night-1c5h.onrender.com';
const WIZ_PORT = 38899;
const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const serverArg = process.argv.find((a) => a.startsWith('--server='))?.slice('--server='.length);

// ------------------------------------------------------------------ scenes

/** One look per moment of the game (WiZ setPilot params). */
const SCENES = {
  lobby: { temp: 2700, dimming: 80 }, // warm and welcoming while people join
  reveal: { r: 120, g: 30, b: 200, dimming: 35 }, // mysterious purple: check your card
  dawn: { r: 255, g: 105, b: 25, dimming: 55 }, // sunrise orange
  night: { r: 15, g: 35, b: 255, dimming: 12 }, // deep, dark blue
  day: { temp: 4200, dimming: 100 }, // bright daylight for the discussion
  vote: { r: 255, g: 25, b: 15, dimming: 70 }, // red: time to vote
  verdict: { r: 255, g: 140, b: 0, dimming: 70 }, // amber: a tie to settle
  party: { sceneId: 4, speed: 140, dimming: 100 }, // game over: WiZ "Party"
};
const FLASH = {
  kill: { r: 255, g: 0, b: 0 },
  voteout: { r: 255, g: 0, b: 0 },
  removed: { r: 255, g: 0, b: 0 },
  saved: { r: 0, g: 255, b: 80 },
  restored: { r: 0, g: 255, b: 80 },
  revive: { r: 255, g: 200, b: 60 },
  silence: { r: 150, g: 60, b: 255 },
  joker: { r: 255, g: 0, b: 200 },
};

function sceneFor(view) {
  if (!view) return null;
  if (view.status === 'lobby') return 'lobby';
  const phase = view.game?.phase;
  if (!phase) return 'lobby';
  return { reveal: 'reveal', prenight: 'dawn', night: 'night', morning: 'day', discussion: 'day', voting: 'vote', verdict: 'verdict', game_over: 'party' }[phase] ?? 'lobby';
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
let busyUntil = 0;
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

async function applyScene(name) {
  if (!name || name === current) return;
  current = name;
  console.log(`💡 ${new Date().toLocaleTimeString()}  ${name}`);
  await snapshot();
  await setAll(SCENES[name], name);
}

async function flash(tag) {
  const color = FLASH[tag];
  if (!color) return;
  busyUntil = Date.now() + 2200;
  console.log(`⚡ ${tag}`);
  for (let i = 0; i < 2; i++) {
    await setAll({ ...color, dimming: 100 }, `flash ${tag}`);
    await new Promise((r) => setTimeout(r, 380));
    await setAll({ ...color, dimming: 10 }, `flash ${tag} dim`);
    await new Promise((r) => setTimeout(r, 260));
  }
  current = null;
  busyUntil = 0;
  await applyScene(wanted); // wherever the game is now (it may have moved on during the flash)
}

/** Put every light back exactly as it was before the game took over. */
async function restore() {
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
    await applyScene(name);
    await new Promise((r) => setTimeout(r, 3000));
  }
  wanted = 'day';
  await flash('kill');
  await new Promise((r) => setTimeout(r, 1500));
  await applyScene('party');
  await new Promise((r) => setTimeout(r, 4000));
  await restore();
  process.exit(0);
}

// ------------------------------------------------------------------ following the game

async function follow(config) {
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
    // The party is over and the lights are back to normal: leave them alone until the next game.
    if (scene === 'party' && room.overAt && Date.now() - room.overAt > 45_000) return;
    if (seq !== room.seq) {
      const first = room.seq === undefined;
      room.seq = seq;
      room.overAt = g?.phase === 'game_over' && view.status !== 'lobby' ? (first ? Date.now() - 40_000 : Date.now()) : 0;
      // A new phase: the TV's curtain plays for ~2 s, then the big news lands — flash with it.
      const tags = first ? [] : (g?.news ?? []).map((n) => n.tag).filter((t) => t && FLASH[t]);
      clearTimeout(flashTimer); // a flash for a phase that's already over is skipped
      await applyScene(scene);
      if (tags.length) flashTimer = setTimeout(() => flash(tags[0]).catch(() => {}), 2000);
    } else if (Date.now() > busyUntil) {
      await applyScene(scene);
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
      if (room?.overAt && Date.now() - room.overAt > 45_000 && original.size) await restore();
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
if ((!demoMode && !config.hostCode) || config.wizRoomId === undefined || args.has('--setup')) config = await setup(config, { needCode: !demoMode });

const stop = async () => {
  await restore();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

if (demoMode) await demo(config);
else await follow(config);
