/**
 * AUTHORITATIVE GAME ENGINE
 * -------------------------
 * Pure state-machine functions that mutate a Room in place. They run only on
 * the server. Every function validates actor, room, phase, phase sequence and
 * eligibility before changing anything, and throws GameError otherwise.
 *
 * Resolution order (night):  see NIGHT ORDER below and docs/RULES.md.
 */
import { ABILITIES, ROLES, ROLE_ORDER, isMafiaTeam, roleAlignment, type AbilityDef } from './roles';
import { analyzeDistribution, suggestDistribution } from './distribution';
import { MAX_PLAYERS, defaultSettings, fillTemplate, mergeSettings, type Settings, type SettingsPatch } from './settings';
import type { Game, LogEntry, MorningReport, NightAction, Phase, Player, Room, Verdict, WinResult } from './types';

export interface Rng {
  /** Uniform integer in [0, maxExclusive). Must be cryptographically secure in production. */
  int(maxExclusive: number): number;
  id(): string;
}

export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const fail = (code: string, message: string): never => {
  throw new GameError(code, message);
};

// ---------------------------------------------------------------- helpers

export function settingsOf(room: Room): Settings {
  return room.game?.settings ?? room.settings;
}

export function getPlayer(room: Room, id: string): Player {
  const p = room.players.find((x) => x.id === id);
  if (!p) fail('no_player', 'That player is not in this room.');
  return p!;
}

export function alivePlayers(room: Room): Player[] {
  return room.players.filter((p) => p.alive);
}

function bySeat(a: Player, b: Player) {
  return a.seat - b.seat;
}

export function addLog(room: Room, now: number, kind: string, text: string, visibility: LogEntry['visibility'] = 'public') {
  room.logSeq += 1;
  room.log.push({
    seq: room.logSeq,
    at: now,
    round: room.game?.round ?? 0,
    phase: room.game?.phase ?? 'lobby',
    kind,
    visibility,
    text,
  });
  if (room.log.length > 2000) room.log.splice(0, room.log.length - 2000);
}

export function addPrivate(room: Room, rng: Rng, now: number, playerId: string, kind: string, text: string) {
  room.privateResults.push({ id: rng.id(), playerId, round: room.game?.round ?? 0, kind, text, at: now });
}

function requireGame(room: Room): Game {
  if (room.status !== 'active' || !room.game) fail('no_game', 'No game is running.');
  return room.game!;
}

function requirePhase(room: Room, phase: Phase, phaseSeq?: number): Game {
  const g = requireGame(room);
  if (g.phase !== phase) fail('wrong_phase', `That can only be done during the ${phase} phase.`);
  if (phaseSeq !== undefined && phaseSeq !== g.phaseSeq) fail('phase_closed', 'That phase has already closed.');
  if (g.pausedRemainingMs !== null) fail('paused', 'The game is paused.');
  return g;
}

function cleanName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const name = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  if (name.length < 1 || name.length > 20) fail('bad_name', 'Names must be 1–20 characters.');
  return name;
}

function freshPlayerState(): Omit<Player, 'id' | 'name' | 'seat' | 'tokenHash' | 'isHost' | 'joinedAt' | 'sessionVersion' | 'rejoinCodeHash' | 'photoVersion'> {
  return {
    ready: false,
    alive: true,
    roleId: null,
    originalRoleId: null,
    revealAck: false,
    deathRound: null,
    deathCause: null,
    charges: {},
    stolen: null,
    lostAbilities: [],
    thiefTargets: [],
    silencedRound: null,
    noVoteRound: null,
    lastReviveRound: null,
    revivedCount: 0,
    lateJoiner: false,
  };
}

// ---------------------------------------------------------------- room / lobby

export function createRoom(opts: {
  code: string;
  hostName: string;
  hostTokenHash: string;
  hostPlays: boolean;
  now: number;
  playerCount?: number;
  hostPlayerId?: string;
}): Room {
  const playerCount = opts.playerCount ?? 8;
  const settings: Settings = { ...defaultSettings(playerCount), hostPlays: opts.hostPlays, roles: suggestDistribution(playerCount) };
  const room: Room = {
    code: opts.code,
    createdAt: opts.now,
    updatedAt: opts.now,
    status: 'lobby',
    hostName: cleanName(opts.hostName),
    hostTokenHash: opts.hostTokenHash,
    hostPlayerId: null,
    settings,
    players: [],
    game: null,
    log: [],
    logSeq: 0,
    privateResults: [],
    recentActionIds: {},
    gamesPlayed: 0,
    nextSeat: 1,
  };
  if (opts.hostPlays) {
    const p = addPlayer(room, { id: opts.hostPlayerId ?? 'host', name: room.hostName, tokenHash: opts.hostTokenHash, now: opts.now, isHost: true });
    room.hostPlayerId = p.id;
  }
  addLog(room, opts.now, 'room', `Room ${opts.code} opened by ${room.hostName}.`);
  return room;
}

export function addPlayer(room: Room, opts: { id: string; name: string; tokenHash: string; now: number; isHost?: boolean }): Player {
  if (room.status === 'closed') fail('room_closed', 'This room has been closed.');
  const name = cleanName(opts.name);
  if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    fail('name_taken', `“${name}” is already taken in this room. Try adding an initial.`);
  }
  let late = false;
  if (room.status === 'active' || room.status === 'over') {
    const g = room.game!;
    if (room.status === 'over' || !g.settings.allowLateJoin) fail('in_progress', 'This game has already started.');
    if (room.players.length >= MAX_PLAYERS) fail('room_full', 'This room is full.');
    late = true;
  } else if (room.players.length >= room.settings.playerCount) {
    fail('room_full', `This room is full (${room.settings.playerCount} players). Ask the host to raise the player count.`);
  }
  const p: Player = {
    id: opts.id,
    name,
    seat: room.nextSeat++,
    tokenHash: opts.tokenHash,
    isHost: !!opts.isHost,
    joinedAt: opts.now,
    sessionVersion: 1,
    rejoinCodeHash: null,
    photoVersion: null,
    ...freshPlayerState(),
  };
  if (p.isHost) p.ready = true;
  if (late) {
    // Late joiners always enter as Villagers so the secret distribution cannot be gamed.
    p.roleId = 'villager';
    p.originalRoleId = 'villager';
    p.revealAck = true;
    p.lateJoiner = true;
    addLog(room, opts.now, 'join', `${name} joined the game late.`);
    addLog(room, opts.now, 'role', `${name} (late) was assigned Villager.`, 'host');
  } else {
    addLog(room, opts.now, 'join', `${name} joined the room.`);
  }
  room.players.push(p);
  return p;
}

export function removePlayer(room: Room, playerId: string, now: number) {
  if (room.status !== 'lobby') fail('wrong_phase', 'Players can only be removed in the lobby. Use “Eliminate” to correct a running game.');
  const p = getPlayer(room, playerId);
  if (p.isHost) fail('forbidden', 'The host cannot be removed.');
  room.players = room.players.filter((x) => x.id !== playerId);
  addLog(room, now, 'kick', `${p.name} was removed by the host.`);
}

export function setReady(room: Room, playerId: string, ready: boolean) {
  if (room.status !== 'lobby') fail('wrong_phase', 'The game has already started.');
  getPlayer(room, playerId).ready = ready;
}

export function updateSettings(room: Room, patch: SettingsPatch) {
  if (room.status !== 'lobby') fail('wrong_phase', 'Settings are locked once the game starts.');
  const countChanged = patch.playerCount !== undefined && patch.playerCount !== room.settings.playerCount;
  const nextPatch = { ...patch };
  if (countChanged && !patch.roles) nextPatch.roles = suggestDistribution(patch.playerCount!);
  if (patch.hostPlays !== undefined && patch.hostPlays !== room.settings.hostPlays) {
    fail('bad_request', 'Use the host-plays toggle to change whether the host plays.');
  }
  let next: Settings;
  try {
    next = mergeSettings(room.settings, nextPatch);
  } catch {
    return fail('bad_settings', 'Those settings are not valid.');
  }
  if (next.playerCount < room.players.length) {
    fail('bad_settings', `There are already ${room.players.length} players in the room.`);
  }
  room.settings = next;
}

/** Toggle whether the host takes a seat. A playing host gets no secret information on their dashboard. */
export function setHostPlays(room: Room, hostPlays: boolean, now: number, newPlayerId: string) {
  if (room.status !== 'lobby') fail('wrong_phase', 'Locked once the game starts.');
  if (hostPlays === room.settings.hostPlays) return;
  if (hostPlays) {
    if (room.players.length >= room.settings.playerCount) fail('room_full', 'Raise the player count first.');
    const p = addPlayer(room, { id: newPlayerId, name: room.hostName, tokenHash: room.hostTokenHash, now, isHost: true });
    room.hostPlayerId = p.id;
  } else {
    room.players = room.players.filter((p) => !p.isHost);
    room.hostPlayerId = null;
  }
  room.settings = { ...room.settings, hostPlays };
}

// ---------------------------------------------------------------- start

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function startGame(room: Room, now: number, rng: Rng, opts: { force?: boolean } = {}) {
  if (room.status !== 'lobby') fail('wrong_phase', 'The game has already started.');
  const s = room.settings;
  const n = room.players.length;
  if (n !== s.playerCount) fail('not_ready', `The game is set for ${s.playerCount} players but ${n} have joined.`);
  const report = analyzeDistribution(s, n);
  if (report.errors.length) fail('bad_settings', report.errors[0]);
  const notReady = room.players.filter((p) => !p.ready);
  if (notReady.length && !opts.force) fail('not_ready', `${notReady.length} player(s) are not ready yet.`);

  const deck: string[] = [];
  for (const [roleId, count] of Object.entries(s.roles)) for (let i = 0; i < count; i++) deck.push(roleId);
  const shuffled = shuffle(deck, rng);

  const frozen: Settings = structuredClone(s);
  const seated = [...room.players].sort(bySeat);
  seated.forEach((p, i) => {
    Object.assign(p, freshPlayerState(), { ready: p.ready });
    p.roleId = shuffled[i];
    p.originalRoleId = shuffled[i];
    for (const a of ROLES[p.roleId].abilities) {
      const c = ABILITIES[a.id].charges(frozen);
      if (c !== null) p.charges[a.id] = c;
    }
  });

  room.privateResults = [];
  room.recentActionIds = {};
  room.game = {
    settings: frozen,
    phase: 'reveal',
    round: 0,
    phaseSeq: 0,
    phaseStartedAt: now,
    phaseEndsAt: null,
    pausedRemainingMs: null,
    night: { actions: {} },
    day: { votes: {}, runoff: null, runoffUsed: false },
    pendingTie: null,
    lastVerdict: null,
    lastMorning: null,
    winner: null,
    jesterWinners: [],
    stats: { suspicion: {}, nightKills: 0, saves: 0, revives: 0, voteEliminations: 0, investigations: 0 },
    startedAt: now,
    endedAt: null,
  };
  room.status = 'active';
  enterPhase(room, 'reveal', now);
  addLog(room, now, 'start', `The game has begun with ${n} players. Check your phone — privately.`);
  addLog(room, now, 'roles', 'Roles: ' + seated.map((p) => `${p.name}=${ROLES[p.roleId!].name}`).join(', '), 'host');
}

// ---------------------------------------------------------------- phases

function phaseDuration(s: Settings, phase: Phase): number | null {
  switch (phase) {
    case 'reveal':
      return s.revealSeconds;
    case 'prenight':
      return s.preNightSeconds;
    case 'night':
      return s.nightSeconds;
    case 'morning':
      return s.morningSeconds;
    case 'discussion':
      return s.discussionSeconds;
    case 'voting':
      return s.votingSeconds;
    case 'verdict':
      return s.verdictSeconds;
    default:
      return null;
  }
}

function enterPhase(room: Room, phase: Phase, now: number) {
  const g = room.game!;
  g.phase = phase;
  g.phaseSeq += 1;
  g.phaseStartedAt = now;
  const d = phaseDuration(g.settings, phase);
  g.phaseEndsAt = d === null ? null : now + d * 1000;
  g.pausedRemainingMs = null;
}

/**
 * The pre-night round runs whenever the Thief or Imposter is in the SETUP — even
 * after they die — so its presence never reveals who is still alive.
 */
export function hasPreNight(s: Settings): boolean {
  return s.preNightRound && ((s.roles.thief ?? 0) > 0 || (s.roles.imposter ?? 0) > 0);
}

/** Phase in which an ability is used: pre-night abilities move to 'prenight' when that round is on. */
export function abilityPhase(abilityId: string, s: Settings): 'prenight' | 'night' | 'other' {
  const def = ABILITIES[abilityId];
  if (!def || def.kind !== 'night') return 'other';
  return def.preNight && hasPreNight(s) ? 'prenight' : 'night';
}

function beginNightCycle(room: Room, now: number) {
  const g = room.game!;
  g.round += 1;
  if (hasPreNight(g.settings)) {
    g.night.actions = {};
    enterPhase(room, 'prenight', now);
    addLog(room, now, 'phase', `Before nightfall ${g.round}: everyone open your secret panel and make a choice.`);
    return;
  }
  startNight(room, now);
}

function startNight(room: Room, now: number) {
  const g = room.game!;
  g.night.actions = {};
  enterPhase(room, 'night', now);
  addLog(room, now, 'phase', `Night ${g.round} falls. Everyone: open your secret panel and lock in a choice.`);
}

function startDiscussion(room: Room, now: number) {
  const g = room.game!;
  g.day = { votes: {}, runoff: null, runoffUsed: false };
  enterPhase(room, 'discussion', now);
  addLog(room, now, 'phase', `Day ${g.round}: discussion is open.`);
}

function startVoting(room: Room, now: number, runoff: string[] | null) {
  const g = room.game!;
  g.day.votes = {};
  g.day.runoff = runoff;
  enterPhase(room, 'voting', now);
  addLog(room, now, 'phase', runoff ? `Runoff vote between ${runoff.map((id) => getPlayer(room, id).name).join(' and ')}.` : `Day ${g.round}: voting is open.`);
}

/** Advance to the next phase. `by` is recorded in the log. */
export function advancePhase(room: Room, now: number, rng: Rng, by: 'timer' | 'host' | 'auto' = 'host') {
  const g = requireGame(room);
  if (by === 'host') addLog(room, now, 'host', `Host advanced from ${g.phase}.`, 'host');
  switch (g.phase) {
    case 'reveal':
      return beginNightCycle(room, now);
    case 'prenight':
      return resolvePreNight(room, now, rng);
    case 'night':
      return resolveNight(room, now, rng);
    case 'morning':
      return startDiscussion(room, now);
    case 'discussion':
      return startVoting(room, now, null);
    case 'voting':
      return resolveVotes(room, now);
    case 'verdict':
      if (g.pendingTie) fail('pending_tie', 'Resolve the tied vote first.');
      return beginNightCycle(room, now);
    default:
      fail('wrong_phase', 'The game is over.');
  }
}

/** Called by the server loop. Returns true if the room changed. */
export function tick(room: Room, now: number, rng: Rng): boolean {
  if (room.status !== 'active' || !room.game) return false;
  const g = room.game;
  if (g.pausedRemainingMs !== null || g.phase === 'game_over') return false;
  const s = g.settings;
  const auto = s.advanceMode === 'auto';
  if (g.phase === 'reveal' && auto && room.players.every((p) => p.revealAck)) {
    advancePhase(room, now, rng, 'auto');
    return true;
  }
  if ((g.phase === 'night' || g.phase === 'prenight') && s.nightAutoResolve && nightComplete(room)) {
    advancePhase(room, now, rng, 'auto');
    return true;
  }
  if (g.phase === 'voting' && auto && !s.allowVoteChange && votingComplete(room)) {
    advancePhase(room, now, rng, 'auto');
    return true;
  }
  if (auto && g.phaseEndsAt !== null && now >= g.phaseEndsAt && !(g.phase === 'verdict' && g.pendingTie)) {
    advancePhase(room, now, rng, 'timer');
    return true;
  }
  return false;
}

export function acknowledgeRole(room: Room, playerId: string) {
  const g = requireGame(room);
  if (g.phase !== 'reveal') return;
  getPlayer(room, playerId).revealAck = true;
}

// ---------------------------------------------------------------- abilities

export interface HeldAbility {
  abilityId: string;
  source: 'role' | 'stolen';
  charges: number | null;
}

export function heldAbilities(room: Room, p: Player): HeldAbility[] {
  const s = settingsOf(room);
  if (!p.roleId) return [];
  const out: HeldAbility[] = [];
  for (const a of ROLES[p.roleId].abilities) {
    if (a.enabled && !a.enabled(s)) continue;
    if (p.lostAbilities.includes(a.id)) continue;
    out.push({ abilityId: a.id, source: 'role', charges: a.id in p.charges ? p.charges[a.id] : null });
  }
  if (p.stolen && !out.some((h) => h.abilityId === p.stolen!.abilityId)) {
    out.push({ abilityId: p.stolen.abilityId, source: 'stolen', charges: p.stolen.charges });
  }
  return out;
}

function hasUsable(room: Room, p: Player, abilityId: string): HeldAbility | undefined {
  return heldAbilities(room, p).find((h) => h.abilityId === abilityId && (h.charges === null || h.charges > 0));
}

function useCharge(room: Room, p: Player, abilityId: string) {
  const h = heldAbilities(room, p).find((x) => x.abilityId === abilityId);
  if (!h) return;
  if (h.source === 'role') {
    if (abilityId in p.charges) p.charges[abilityId] = Math.max(0, p.charges[abilityId] - 1);
  } else if (p.stolen) {
    if (p.stolen.charges !== null) p.stolen.charges = Math.max(0, p.stolen.charges - 1);
    if (p.stolen.duration === 'oneUse' || p.stolen.charges === 0) expireStolen(room, p);
  }
}

function expireStolen(room: Room, thief: Player) {
  const st = thief.stolen;
  if (!st) return;
  if (st.mode === 'take') {
    const victim = room.players.find((x) => x.id === st.fromId);
    if (victim) victim.lostAbilities = victim.lostAbilities.filter((a) => a !== st.abilityId);
  }
  thief.stolen = null;
}

export interface NightOption {
  abilityId: string;
  source: 'role' | 'stolen' | 'decoy';
  name: string;
  prompt: string;
  /** Player ids — or ability ids when targetKind is 'power'. */
  targets: string[];
  targetKind: 'player' | 'power';
  charges: number | null;
  team: boolean;
  changeable: boolean;
}

const DECOY_PROMPT = 'Who do you suspect most tonight?';

function actsWhileDead(room: Room, p: Player): boolean {
  return !p.alive && p.roleId === 'priest' && settingsOf(room).priestActsWhenDead;
}

function targetsFor(room: Room, p: Player, def: AbilityDef): string[] {
  const s = settingsOf(room);
  const players = [...room.players].sort(bySeat);
  let list: Player[];
  switch (def.target) {
    case 'alive-other':
      list = players.filter((x) => x.alive && x.id !== p.id);
      break;
    case 'alive-any':
      list = players.filter((x) => x.alive);
      if (def.id === 'protect' && !s.doctorSelfProtect) list = list.filter((x) => x.id !== p.id);
      if (def.id === 'guard' && !s.bodyguardSelfProtect) list = list.filter((x) => x.id !== p.id);
      break;
    case 'alive-non-mafia':
      list = players.filter((x) => x.alive && !isMafiaTeam(x.roleId, s));
      break;
    case 'dead':
      list = players.filter((x) => !x.alive && (x.id !== p.id || s.priestSelfRevive));
      break;
    case 'self':
      list = p.alive ? [p] : [];
      break;
  }
  if (def.id === 'steal' && !s.thiefRepeatTarget) list = list.filter((x) => !p.thiefTargets.includes(x.id));
  return list.map((x) => x.id);
}

/**
 * Powers the Thief may name in "power" mode: every transferable power of every role in
 * the SETUP (not just living holders), so the list never reveals who is alive.
 */
export function stealablePowers(room: Room, thief: Player): string[] {
  const s = settingsOf(room);
  const out: string[] = [];
  for (const roleId of ROLE_ORDER) {
    if (!s.roles[roleId] || !ROLES[roleId]) continue;
    for (const a of ROLES[roleId].abilities) {
      const def = ABILITIES[a.id];
      if (!def || !def.transferable || a.id === 'steal' || out.includes(a.id)) continue;
      if (a.enabled && !a.enabled(s)) continue;
      if (def.kind === 'passive' && !s.thiefStealPassive) continue;
      if (!s.thiefRepeatTarget && thief.thiefTargets.includes(a.id)) continue;
      out.push(a.id);
    }
  }
  return out;
}

export function nightOptions(room: Room, playerId: string): NightOption[] {
  const g = room.game;
  if (!g || room.status !== 'active' || (g.phase !== 'night' && g.phase !== 'prenight')) return [];
  const phase = g.phase;
  const p = getPlayer(room, playerId);
  const s = g.settings;
  if (!p.alive && !actsWhileDead(room, p)) return [];
  const opts: NightOption[] = [];
  for (const h of heldAbilities(room, p)) {
    const def = ABILITIES[h.abilityId];
    if (!def || abilityPhase(def.id, s) !== phase) continue;
    if (h.charges !== null && h.charges <= 0) continue;
    if (!p.alive && def.id !== 'revive') continue;
    if (def.id === 'steal' && p.stolen) continue;
    if (def.id === 'revive' && s.priestAlternateRounds && p.lastReviveRound !== null && p.lastReviveRound === g.round - 1) continue;
    const powerMode = def.id === 'steal' && s.thiefTargetMode === 'power';
    const targets = powerMode ? stealablePowers(room, p) : targetsFor(room, p, def);
    if (!targets.length) continue;
    opts.push({
      abilityId: def.id,
      source: h.source,
      name: def.name,
      prompt: def.prompt,
      targets,
      targetKind: powerMode ? 'power' : 'player',
      charges: h.charges,
      team: !!def.team,
      changeable: !!def.team,
    });
  }
  if (!opts.length && p.alive) {
    // ANTI-CHEAT: players without a power still get an identical-looking choice
    // so nobody can tell who has a role by watching who taps their phone.
    opts.push({
      abilityId: 'decoy',
      source: 'decoy',
      name: 'Suspicion',
      prompt: phase === 'prenight' ? 'Before nightfall: who do you suspect most?' : DECOY_PROMPT,
      targets: room.players.filter((x) => x.alive && x.id !== p.id).sort(bySeat).map((x) => x.id),
      targetKind: 'player',
      charges: null,
      team: false,
      changeable: false,
    });
  }
  return opts;
}

export function submitNightAction(
  room: Room,
  playerId: string,
  input: { abilityId: string; targetId: string | null; phaseSeq: number },
  now: number,
) {
  const g = requirePhase(room, room.game?.phase === 'prenight' ? 'prenight' : 'night', input.phaseSeq);
  const opt = nightOptions(room, playerId).find((o) => o.abilityId === input.abilityId);
  if (!opt) fail('not_eligible', 'You cannot use that ability right now.');
  if (input.targetId !== null && !opt!.targets.includes(input.targetId)) fail('invalid_target', 'That target is not allowed.');
  const key = `${playerId}:${input.abilityId}`;
  if (g.night.actions[key] && !opt!.changeable) fail('already_submitted', 'You already locked in your choice tonight.');
  const action: NightAction = { actorId: playerId, abilityId: input.abilityId, targetId: input.targetId, at: now };
  g.night.actions[key] = action;
}

export function nightComplete(room: Room): boolean {
  const g = room.game;
  if (!g || (g.phase !== 'night' && g.phase !== 'prenight')) return false;
  return room.players.every((p) => nightOptions(room, p.id).every((o) => !!g.night.actions[`${p.id}:${o.abilityId}`]));
}

/** Leader breaks Mafia ties: the Godfather if they join the hit, otherwise the lowest-seated living member. */
export function mafiaLeader(room: Room): Player | null {
  const members = room.players
    .filter((p) => p.alive && hasUsable(room, p, 'mafia_kill'))
    .sort((a, b) => (a.roleId === 'godfather' ? -1 : b.roleId === 'godfather' ? 1 : a.seat - b.seat));
  return members[0] ?? null;
}

export function mafiaDecision(room: Room): string | null {
  const g = room.game!;
  const s = g.settings;
  const votes = Object.values(g.night.actions).filter((a) => {
    if (a.abilityId !== 'mafia_kill' || a.targetId === null) return false;
    const actor = room.players.find((p) => p.id === a.actorId);
    const target = room.players.find((p) => p.id === a.targetId);
    return !!actor && actor.alive && !!target && target.alive && !isMafiaTeam(target.roleId, s);
  });
  if (!votes.length) return null;
  const leader = mafiaLeader(room);
  const leaderVote = leader ? votes.find((v) => v.actorId === leader.id) : undefined;
  if (s.mafiaDecision === 'leader' && leaderVote) return leaderVote.targetId;
  const counts = new Map<string, number>();
  for (const v of votes) counts.set(v.targetId!, (counts.get(v.targetId!) ?? 0) + 1);
  const top = Math.max(...counts.values());
  const tied = [...counts.entries()].filter(([, c]) => c === top).map(([id]) => id);
  if (tied.length === 1) return tied[0];
  if (leaderVote && tied.includes(leaderVote.targetId!)) return leaderVote.targetId;
  const earliest = [...votes].sort((a, b) => a.at - b.at).find((v) => tied.includes(v.targetId!));
  return earliest!.targetId;
}

// ---------------------------------------------------------------- night resolution

interface NightCtx {
  protectedBy: Map<string, string[]>;
  attacks: { targetId: string; source: string }[];
  deaths: string[];
  revived: string[];
  silenced: string[];
  saved: string[];
  stolen: string[];
  guardOnSave: { actorId: string; targetId: string }[];
}

function newCtx(): NightCtx {
  return { protectedBy: new Map(), attacks: [], deaths: [], revived: [], silenced: [], saved: [], stolen: [], guardOnSave: [] };
}

type Resolver = (room: Room, ctx: NightCtx, a: NightAction, now: number, rng: Rng) => void;

function killPlayer(room: Room, p: Player, cause: Player['deathCause']) {
  p.alive = false;
  p.deathRound = room.game!.round;
  p.deathCause = cause;
  if (p.stolen && p.stolen.mode === 'take') expireStolen(room, p);
}

const protect = (ctx: NightCtx, targetId: string, actorId: string) => {
  ctx.protectedBy.set(targetId, [...(ctx.protectedBy.get(targetId) ?? []), actorId]);
};

/**
 * Resolvers for single-actor night abilities, keyed by ability id.
 * Add a resolver here when you add a new night ability.
 */
export const NIGHT_RESOLVERS: Record<string, Resolver> = {
  protect(room, ctx, a, now) {
    const actor = getPlayer(room, a.actorId);
    protect(ctx, a.targetId!, a.actorId);
    useCharge(room, actor, 'protect');
    addLog(room, now, 'night', `${actor.name} protected ${getPlayer(room, a.targetId!).name}.`, 'host');
  },
  guard(room, ctx, a, now) {
    const actor = getPlayer(room, a.actorId);
    protect(ctx, a.targetId!, a.actorId);
    if (room.game!.settings.bodyguardConsume === 'onUse') useCharge(room, actor, 'guard');
    else ctx.guardOnSave.push({ actorId: a.actorId, targetId: a.targetId! });
    addLog(room, now, 'night', `${actor.name} guarded ${getPlayer(room, a.targetId!).name}.`, 'host');
  },
  v_shield(room, ctx, a, now) {
    const actor = getPlayer(room, a.actorId);
    protect(ctx, actor.id, actor.id);
    useCharge(room, actor, 'v_shield');
    addLog(room, now, 'night', `${actor.name} barricaded themselves.`, 'host');
  },
  silence(room, ctx, a, now) {
    const actor = getPlayer(room, a.actorId);
    const t = getPlayer(room, a.targetId!);
    t.silencedRound = room.game!.round;
    ctx.silenced.push(t.id);
    useCharge(room, actor, 'silence');
    addLog(room, now, 'night', `${actor.name} silenced ${t.name}.`, 'host');
  },
  investigate(room, _ctx, a, now, rng) {
    const s = room.game!.settings;
    const actor = getPlayer(room, a.actorId);
    const t = getPlayer(room, a.targetId!);
    const role = ROLES[t.roleId!];
    const seenAs = role.investigatesAs ? role.investigatesAs(s) : roleAlignment(t.roleId, s);
    const text =
      s.detectiveResult === 'binary'
        ? `${t.name} is ${seenAs === 'mafia' ? 'SUSPICIOUS — they appear to be Mafia.' : 'NOT suspicious.'}`
        : `${t.name} appears to be ${seenAs === 'good' ? 'GOOD (Town)' : seenAs === 'mafia' ? 'MAFIA' : 'NEUTRAL'}.`;
    addPrivate(room, rng, now, actor.id, 'investigation', text);
    useCharge(room, actor, 'investigate');
    room.game!.stats.investigations++;
    addLog(room, now, 'night', `${actor.name} investigated ${t.name} → ${seenAs}.`, 'host');
  },
  v_hunch(room, _ctx, a, now, rng) {
    const actor = getPlayer(room, a.actorId);
    const t = getPlayer(room, a.targetId!);
    const hasNight = heldAbilities(room, t).some((h) => ABILITIES[h.abilityId]?.kind === 'night');
    addPrivate(room, rng, now, actor.id, 'hunch', `${t.name} ${hasNight ? 'HAS' : 'does NOT have'} a night power.`);
    useCharge(room, actor, 'v_hunch');
    addLog(room, now, 'night', `${actor.name} used Hunch on ${t.name}.`, 'host');
  },
  revive(room, ctx, a, now, rng) {
    doRevive(room, ctx, a, now, rng, 'revive');
  },
  imposter_revive(room, ctx, a, now, rng) {
    doRevive(room, ctx, a, now, rng, 'imposter_revive');
  },
  steal(room, ctx, a, now, rng) {
    const s = room.game!.settings;
    const thief = getPlayer(room, a.actorId);
    useCharge(room, thief, 'steal');
    thief.thiefTargets.push(a.targetId!);
    if (!thief.alive || ctx.deaths.includes(thief.id)) return;
    const stealable = (h: HeldAbility) => {
      const def = ABILITIES[h.abilityId];
      if (!def || !def.transferable || h.source !== 'role') return false;
      if (h.charges !== null && h.charges <= 0) return false;
      return def.kind !== 'passive' || s.thiefStealPassive;
    };
    let t: Player | undefined;
    let pick: HeldAbility | undefined;
    if (s.thiefTargetMode === 'power') {
      // Blind steal: the Thief names a power; the server finds who holds it. The Thief never learns who.
      const holders = room.players
        .filter((x) => x.alive && x.id !== thief.id)
        .map((x) => ({ x, h: heldAbilities(room, x).find((h) => h.abilityId === a.targetId && stealable(h)) }))
        .filter((c) => !!c.h);
      const chosen = holders.length ? holders[rng.int(holders.length)] : undefined;
      t = chosen?.x;
      pick = chosen?.h;
      if (!t || !pick) {
        addPrivate(room, rng, now, thief.id, 'steal', `Nobody could give up the ${ABILITIES[a.targetId!]?.name ?? ''} power. Your attempt was spent.`);
        addLog(room, now, 'night', `${thief.name} tried to steal ${ABILITIES[a.targetId!]?.name} — no living holder.`, 'host');
        return;
      }
    } else {
      t = getPlayer(room, a.targetId!);
      const candidates = heldAbilities(room, t).filter(stealable);
      candidates.sort((x, y) => (ABILITIES[x.abilityId].kind === 'night' ? -1 : 0) - (ABILITIES[y.abilityId].kind === 'night' ? -1 : 0));
      pick = candidates[0];
      if (!pick) {
        addPrivate(room, rng, now, thief.id, 'steal', `${t.name} had nothing you could steal. Your attempt was spent.`);
        addLog(room, now, 'night', `${thief.name} tried to steal from ${t.name} — nothing transferable.`, 'host');
        return;
      }
    }
    const def = ABILITIES[pick.abilityId];
    thief.stolen = {
      abilityId: pick.abilityId,
      fromId: t.id,
      charges: s.thiefDuration === 'oneUse' ? 1 : pick.charges,
      mode: s.thiefMode,
      duration: s.thiefDuration,
    };
    ctx.stolen.push(t.id);
    const preNight = room.game!.phase === 'prenight';
    if (s.thiefMode === 'take') {
      t.lostAbilities.push(pick.abilityId);
      addPrivate(
        room,
        rng,
        now,
        t.id,
        'stolen',
        s.thiefDuration === 'permanent'
          ? `The Thief stole your ${def.name} power. From now on you play as a Villager — you are still on the same team.`
          : `Someone stole your ${def.name} ability. You cannot use it until it is returned.`,
      );
    }
    const when = def.kind !== 'night' ? 'It applies automatically.' : preNight ? 'Use it in your night panel — starting tonight.' : 'It appears in your night panel from tomorrow night.';
    const from = s.thiefTargetMode === 'power' ? 'You don’t know whose it was.' : `It was ${t.name}’s.`;
    addPrivate(room, rng, now, thief.id, 'steal', `You stole the ${def.name} power. ${from} ${when}`);
    addLog(room, now, 'night', `${thief.name} stole ${def.name} from ${t.name} (${s.thiefMode}, ${s.thiefDuration}).`, 'host');
  },
};

function doRevive(room: Room, ctx: NightCtx, a: NightAction, now: number, rng: Rng, abilityId: 'revive' | 'imposter_revive') {
  const g = room.game!;
  const s = g.settings;
  const actor = getPlayer(room, a.actorId);
  const t = getPlayer(room, a.targetId!);
  if (t.alive || ctx.deaths.includes(t.id)) {
    addPrivate(room, rng, now, actor.id, 'revive', `Your revival of ${t.name} had no effect.`);
    return;
  }
  t.alive = true;
  t.deathRound = null;
  t.deathCause = null;
  t.revivedCount++;
  if (!s.revivedKeepRole) {
    t.roleId = 'villager';
    t.charges = {};
    t.stolen = null;
    t.lostAbilities = [];
  }
  if (!s.revivedKeepEffects) t.silencedRound = null;
  if (!s.revivedCanActNextPhase) t.noVoteRound = g.round;
  useCharge(room, actor, abilityId);
  if (abilityId === 'revive') actor.lastReviveRound = g.round;
  ctx.revived.push(t.id);
  g.stats.revives++;
  addPrivate(room, rng, now, actor.id, 'revive', `It worked — ${t.name} is back in the game.`);
  addPrivate(room, rng, now, t.id, 'revive', 'You have been brought back to life. Welcome back.');
  addLog(room, now, 'night', `${actor.name} (${ROLES[actor.roleId!].name}) revived ${t.name}.`, 'host');
}

/**
 * NIGHT ORDER (lower first)
 *   10 protect / guard / barricade   — build the protection set
 *   20 silence                        — mark tomorrow's silenced player
 *   50 Mafia hit                      — team decision becomes an attack
 *   55 attacks resolve                — protected targets survive, others die
 *   80 investigate / hunch            — results reflect roles after deaths
 *   90 revive                         — only players dead before tonight
 *   95 steal                          — stolen ability usable from next night
 * Actions are simultaneous: a player killed tonight still has their action resolve
 * (except the Thief, whose steal fails if they die).
 */
export function resolveNight(room: Room, now: number, rng: Rng) {
  const g = room.game!;
  const s = g.settings;
  const ctx: NightCtx = newCtx();

  const actions = Object.values(g.night.actions).filter((a) => {
    if (a.targetId === null) return false;
    const actor = room.players.find((p) => p.id === a.actorId);
    if (!actor) return false;
    if (a.abilityId === 'decoy') {
      g.stats.suspicion[a.targetId] = (g.stats.suspicion[a.targetId] ?? 0) + 1;
      return false;
    }
    // Re-validate: a host correction may have changed things mid-night.
    if (!actor.alive && !actsWhileDead(room, actor)) return false;
    return !!hasUsable(room, actor, a.abilityId) || a.abilityId === 'mafia_kill';
  });

  type Step = { priority: number; order: number; run: () => void };
  const steps: Step[] = [];
  let order = 0;
  for (const a of actions) {
    if (a.abilityId === 'mafia_kill') continue;
    const def = ABILITIES[a.abilityId];
    const resolver = NIGHT_RESOLVERS[a.abilityId];
    if (!def || !resolver) continue;
    steps.push({ priority: def.priority, order: order++, run: () => resolver(room, ctx, a, now, rng) });
  }
  steps.push({
    priority: ABILITIES.mafia_kill.priority,
    order: order++,
    run: () => {
      const target = mafiaDecision(room);
      if (target) {
        ctx.attacks.push({ targetId: target, source: 'mafia' });
        addLog(room, now, 'night', `The Mafia targeted ${getPlayer(room, target).name}.`, 'host');
      } else {
        addLog(room, now, 'night', 'The Mafia did not choose a target.', 'host');
      }
    },
  });
  steps.push({
    priority: 55,
    order: order++,
    run: () => {
      for (const atk of ctx.attacks) {
        const t = getPlayer(room, atk.targetId);
        if (!t.alive) continue;
        const protectors = ctx.protectedBy.get(t.id);
        if (protectors?.length) {
          ctx.saved.push(t.id);
          g.stats.saves++;
          for (const gs of ctx.guardOnSave.filter((x) => x.targetId === t.id)) useCharge(room, getPlayer(room, gs.actorId), 'guard');
          addLog(room, now, 'night', `${t.name} was attacked but saved.`, 'host');
        } else {
          killPlayer(room, t, 'night');
          ctx.deaths.push(t.id);
          g.stats.nightKills++;
        }
      }
    },
  });
  steps.sort((a, b) => a.priority - b.priority || a.order - b.order);
  for (const st of steps) st.run();

  // ---- Public morning announcement (only permitted information)
  const A = s.announcements;
  const lines: string[] = [];
  for (const id of ctx.deaths) {
    const p = getPlayer(room, id);
    lines.push(fillTemplate(A.nightDeath, { name: p.name }) + (s.revealRoleOnDeath ? ` They were the ${ROLES[p.roleId!].name}.` : ''));
  }
  if (!ctx.deaths.length) lines.push(A.noDeath);
  if (ctx.saved.length && s.announceSaves) lines.push('Someone was attacked in the night — but survived.');
  for (const id of ctx.revived) lines.push(fillTemplate(A.revived, { name: getPlayer(room, id).name }));
  if (s.announceSilenced) {
    for (const id of ctx.silenced) {
      const p = getPlayer(room, id);
      if (p.alive) lines.push(fillTemplate(A.silenced, { name: p.name }));
    }
  }
  for (const l of lines) addLog(room, now, 'morning', l);
  const report: MorningReport = { round: g.round, deaths: ctx.deaths, revived: ctx.revived, silenced: ctx.silenced.filter((id) => getPlayer(room, id).alive), saved: ctx.saved.length > 0 };
  g.lastMorning = report;

  const win = checkWin(room);
  if (win) return endGame(room, win, now);
  enterPhase(room, 'morning', now);
}

/**
 * BEFORE NIGHTFALL: the Imposter's revival (90) then the Thief's steal (95).
 * Everyone else submitted a decoy. The public learns only THAT something happened
 * (a revived player is necessarily named — they are visibly back).
 */
export function resolvePreNight(room: Room, now: number, rng: Rng) {
  const g = room.game!;
  const A = g.settings.announcements;
  const ctx = newCtx();
  const actions = Object.values(g.night.actions)
    .filter((a) => {
      if (a.targetId === null || a.abilityId === 'decoy') return false;
      const actor = room.players.find((p) => p.id === a.actorId);
      return !!actor && actor.alive && !!hasUsable(room, actor, a.abilityId) && !!NIGHT_RESOLVERS[a.abilityId];
    })
    .sort((x, y) => ABILITIES[x.abilityId].priority - ABILITIES[y.abilityId].priority || x.at - y.at);
  for (const a of actions) NIGHT_RESOLVERS[a.abilityId](room, ctx, a, now, rng);
  const lines: string[] = [];
  for (const id of ctx.revived) lines.push(fillTemplate(A.revived, { name: getPlayer(room, id).name }));
  if (ctx.stolen.length) lines.push(A.theft);
  if (!lines.length) lines.push(A.quietPreNight);
  for (const l of lines) addLog(room, now, 'prenight', l);
  const win = checkWin(room);
  if (win) return endGame(room, win, now);
  startNight(room, now);
}

// ---------------------------------------------------------------- voting

export function voteEligibility(room: Room, p: Player): { ok: boolean; reason?: string } {
  const g = room.game;
  if (!g) return { ok: false, reason: 'No game.' };
  if (!p.alive) return { ok: false, reason: 'Dead players cannot vote.' };
  if (p.silencedRound === g.round) return { ok: false, reason: 'You are silenced today and cannot vote.' };
  if (p.noVoteRound === g.round) return { ok: false, reason: 'You were just revived and cannot vote this round.' };
  return { ok: true };
}

export function voteTargets(room: Room, p: Player): string[] {
  const g = room.game!;
  let list = room.players.filter((x) => x.alive).sort(bySeat);
  if (!g.settings.allowSelfVote) list = list.filter((x) => x.id !== p.id);
  if (g.day.runoff) list = list.filter((x) => g.day.runoff!.includes(x.id));
  return list.map((x) => x.id);
}

export function hasRally(room: Room, p: Player): boolean {
  return !!hasUsable(room, p, 'v_rally');
}

export function voteWeight(room: Room, p: Player, rally: boolean): number {
  let w = 1;
  if (hasUsable(room, p, 'judge_vote')) w = room.game!.settings.judgeWeight;
  if (rally && hasRally(room, p)) w *= 2;
  return w;
}

export function submitVote(
  room: Room,
  playerId: string,
  input: { targetId: string | null; rally?: boolean; phaseSeq: number },
  now: number,
) {
  const g = requirePhase(room, 'voting', input.phaseSeq);
  const p = getPlayer(room, playerId);
  const elig = voteEligibility(room, p);
  if (!elig.ok) fail('not_eligible', elig.reason!);
  if (input.targetId === null) {
    if (!g.settings.allowAbstain) fail('invalid_target', 'Abstaining is not allowed in this game.');
  } else if (!voteTargets(room, p).includes(input.targetId)) {
    fail('invalid_target', input.targetId === p.id ? 'You cannot vote for yourself.' : 'You cannot vote for that player.');
  }
  if (g.day.votes[playerId] && !g.settings.allowVoteChange) fail('already_voted', 'Your vote is locked in.');
  const rally = !!input.rally && hasRally(room, p);
  g.day.votes[playerId] = { voterId: playerId, targetId: input.targetId, weight: voteWeight(room, p, rally), rally, at: now };
}

export function eligibleVoters(room: Room): Player[] {
  return room.players.filter((p) => voteEligibility(room, p).ok);
}

export function votingComplete(room: Room): boolean {
  const g = room.game;
  if (!g || g.phase !== 'voting') return false;
  return eligibleVoters(room).every((p) => !!g.day.votes[p.id]);
}

/**
 * Tally rules: weights are computed on the server at close (Judge ×judgeWeight,
 * Rally ×2). Abstentions form a "nobody" pile — if it is at least as large as the
 * leader, nobody is eliminated. Ties follow settings.tieRule.
 */
export function resolveVotes(room: Room, now: number) {
  const g = room.game!;
  const s = g.settings;
  const tally: Record<string, number> = {};
  const votes: Record<string, string | null> = {};
  let abstain = 0;
  for (const v of Object.values(g.day.votes).sort((a, b) => a.at - b.at)) {
    const voter = room.players.find((p) => p.id === v.voterId);
    if (!voter || !voteEligibility(room, voter).ok) continue;
    const rally = v.rally && hasRally(room, voter);
    const w = voteWeight(room, voter, rally);
    if (rally) useCharge(room, voter, 'v_rally');
    const judge = heldAbilities(room, voter).find((h) => h.abilityId === 'judge_vote');
    if (judge?.source === 'stolen') useCharge(room, voter, 'judge_vote');
    if (v.targetId === null) {
      abstain += w;
      votes[voter.id] = null;
      continue;
    }
    const target = room.players.find((p) => p.id === v.targetId);
    if (!target || !target.alive) continue;
    tally[target.id] = (tally[target.id] ?? 0) + w;
    votes[voter.id] = target.id;
  }
  if (abstain) tally.abstain = abstain;

  const candidates = Object.entries(tally).filter(([id]) => id !== 'abstain');
  const top = candidates.reduce((m, [, w]) => Math.max(m, w), 0);
  const leaders = candidates.filter(([, w]) => w === top).map(([id]) => id);
  const verdict: Verdict = { round: g.round, eliminatedId: null, tie: false, runoff: !!g.day.runoff, tally, votes, jesterWin: false, decidedByHost: false };

  if (top === 0 || abstain >= top) {
    g.lastVerdict = verdict;
    addLog(room, now, 'verdict', s.announcements.noElimination);
    enterPhase(room, 'verdict', now);
    return;
  }
  if (leaders.length > 1) {
    verdict.tie = true;
    const names = leaders.map((id) => getPlayer(room, id).name).join(' and ');
    if (s.tieRule === 'runoff' && !g.day.runoffUsed) {
      g.day.runoffUsed = true;
      g.lastVerdict = verdict;
      addLog(room, now, 'verdict', `It's a tie between ${names}. A runoff vote begins.`);
      startVoting(room, now, leaders);
      return;
    }
    if (s.tieRule === 'host') {
      g.pendingTie = leaders;
      g.lastVerdict = verdict;
      addLog(room, now, 'verdict', `It's a tie between ${names}. The Game Master will decide.`);
      enterPhase(room, 'verdict', now);
      room.game!.phaseEndsAt = null;
      return;
    }
    g.lastVerdict = verdict;
    addLog(room, now, 'verdict', `It's a tie between ${names}. ${s.announcements.noElimination}`);
    enterPhase(room, 'verdict', now);
    return;
  }
  eliminateByVote(room, leaders[0], verdict, now);
}

function eliminateByVote(room: Room, targetId: string, verdict: Verdict, now: number) {
  const g = room.game!;
  const s = g.settings;
  const t = getPlayer(room, targetId);
  killPlayer(room, t, 'vote');
  g.stats.voteEliminations++;
  verdict.eliminatedId = t.id;
  g.lastVerdict = verdict;
  addLog(room, now, 'verdict', fillTemplate(s.announcements.voteOut, { name: t.name }) + (s.revealRoleOnDeath && t.roleId !== 'jester' ? ` They were the ${ROLES[t.roleId!].name}.` : ''));
  if (t.roleId === 'jester') {
    verdict.jesterWin = true;
    g.jesterWinners.push(t.id);
    addLog(room, now, 'verdict', fillTemplate(s.announcements.jesterWin, { name: t.name }));
    if (s.jesterEndsGame) {
      return endGame(room, { faction: 'jester', winnerIds: [t.id], reason: `${t.name} the Jester tricked the town into voting them out.` }, now);
    }
  }
  const win = checkWin(room);
  if (win) return endGame(room, win, now);
  enterPhase(room, 'verdict', now);
}

export function resolveTie(room: Room, targetId: string | null, now: number) {
  const g = requireGame(room);
  if (g.phase !== 'verdict' || !g.pendingTie) fail('wrong_phase', 'There is no tie to resolve.');
  if (targetId !== null && !g.pendingTie!.includes(targetId)) fail('invalid_target', 'Pick one of the tied players.');
  g.pendingTie = null;
  const verdict = g.lastVerdict!;
  verdict.decidedByHost = true;
  addLog(room, now, 'host', `Game Master broke the tie: ${targetId ? getPlayer(room, targetId).name : 'nobody'}.`, 'host');
  if (targetId === null) {
    addLog(room, now, 'verdict', `The Game Master spared everyone. ${g.settings.announcements.noElimination}`);
    enterPhase(room, 'verdict', now);
    return;
  }
  eliminateByVote(room, targetId, verdict, now);
}

// ---------------------------------------------------------------- victory

/**
 * Evaluation order: (1) Jester (checked at day elimination), (2) everyone dead → draw,
 * (3) no Mafia-aligned alive → Good, (4) Mafia reach parity/majority → Mafia.
 * Survivor neutrals (Thief, Priest) co-win if alive; an earlier Jester win (when the
 * game continued) is also listed.
 */
export function checkWin(room: Room): WinResult | null {
  const s = settingsOf(room);
  const alive = alivePlayers(room);
  const mafia = alive.filter((p) => roleAlignment(p.roleId, s) === 'mafia').length;
  const others = alive.length - mafia;
  let faction: WinResult['faction'] | null = null;
  let reason = '';
  if (alive.length === 0) {
    faction = 'draw';
    reason = 'Nobody is left standing.';
  } else if (mafia === 0) {
    faction = 'good';
    reason = 'Every member of the Mafia has been eliminated.';
  } else if (s.mafiaWin === 'parity' ? mafia >= others : mafia > others) {
    faction = 'mafia';
    reason = 'The Mafia now control the town.';
  }
  if (!faction) return null;
  const winners = new Set<string>();
  if (faction === 'good' || faction === 'mafia') {
    for (const p of room.players) if (roleAlignment(p.roleId, s) === faction) winners.add(p.id);
  }
  for (const p of alive) if (p.roleId && ROLES[p.roleId].winsBySurviving) winners.add(p.id);
  for (const id of room.game?.jesterWinners ?? []) winners.add(id);
  return { faction, winnerIds: [...winners], reason };
}

function endGame(room: Room, win: WinResult, now: number) {
  const g = room.game!;
  g.winner = win;
  g.endedAt = now;
  g.pendingTie = null;
  enterPhase(room, 'game_over', now);
  room.status = 'over';
  room.gamesPlayed++;
  const label = { good: 'The Town wins!', mafia: 'The Mafia wins!', jester: 'The Jester wins!', draw: 'It’s a draw.', none: 'Game ended.' }[win.faction];
  addLog(room, now, 'gameover', `${label} ${win.reason}`);
}

// ---------------------------------------------------------------- host controls

export function pauseGame(room: Room, now: number) {
  const g = requireGame(room);
  if (g.pausedRemainingMs !== null) return;
  g.pausedRemainingMs = g.phaseEndsAt === null ? -1 : Math.max(0, g.phaseEndsAt - now);
  g.phaseEndsAt = null;
  addLog(room, now, 'pause', 'The Game Master paused the game.');
}

export function resumeGame(room: Room, now: number) {
  const g = requireGame(room);
  if (g.pausedRemainingMs === null) return;
  g.phaseEndsAt = g.pausedRemainingMs < 0 ? null : now + g.pausedRemainingMs;
  g.pausedRemainingMs = null;
  addLog(room, now, 'pause', 'The game has resumed.');
}

export function extendTimer(room: Room, seconds: number, now: number) {
  const g = requireGame(room);
  if (!Number.isFinite(seconds) || seconds < -600 || seconds > 1800) fail('bad_request', 'Invalid amount.');
  if (g.pausedRemainingMs !== null && g.pausedRemainingMs >= 0) g.pausedRemainingMs = Math.max(0, g.pausedRemainingMs + seconds * 1000);
  else if (g.phaseEndsAt !== null) g.phaseEndsAt = Math.max(now, g.phaseEndsAt + seconds * 1000);
  else g.phaseEndsAt = now + Math.max(0, seconds) * 1000;
  addLog(room, now, 'host', `Timer adjusted by ${seconds}s.`, 'host');
}

export function hostEliminate(room: Room, playerId: string, now: number) {
  const g = requireGame(room);
  const p = getPlayer(room, playerId);
  if (!p.alive) fail('invalid_target', `${p.name} is already out.`);
  killPlayer(room, p, 'host');
  delete g.day.votes[p.id];
  addLog(room, now, 'correction', `Game Master correction: ${p.name} has been removed from play.` + (g.settings.revealRoleOnDeath ? ` They were the ${ROLES[p.roleId!].name}.` : ''));
  const win = checkWin(room);
  if (win) endGame(room, win, now);
}

export function hostRestore(room: Room, playerId: string, now: number) {
  requireGame(room);
  const p = getPlayer(room, playerId);
  if (p.alive) fail('invalid_target', `${p.name} is already alive.`);
  p.alive = true;
  p.deathRound = null;
  p.deathCause = null;
  addLog(room, now, 'correction', `Game Master correction: ${p.name} has been restored to the game.`);
  const win = checkWin(room);
  if (win) endGame(room, win, now);
}

export function hostEndGame(room: Room, now: number) {
  requireGame(room);
  endGame(room, { faction: 'none', winnerIds: [], reason: 'The Game Master ended the game.' }, now);
}

export function hostAnnounce(room: Room, text: string, now: number) {
  const clean = text.replace(/[<>]/g, '').trim().slice(0, 240);
  if (!clean) fail('bad_request', 'Announcement is empty.');
  addLog(room, now, 'gm', `📣 ${clean}`);
}

/** Back to the lobby with the same players (Play Again / Restart). Game history stays in the log. */
export function resetToLobby(room: Room, now: number) {
  if (room.status === 'closed') fail('room_closed', 'Room is closed.');
  if (room.status === 'active') addLog(room, now, 'host', 'The Game Master restarted the game.');
  room.status = 'lobby';
  room.game = null;
  room.privateResults = [];
  room.recentActionIds = {};
  for (const p of room.players) Object.assign(p, freshPlayerState(), { ready: p.isHost });
  if (room.players.length > room.settings.playerCount) {
    room.settings = { ...room.settings, playerCount: room.players.length, roles: suggestDistribution(room.players.length) };
  }
  addLog(room, now, 'room', 'Back in the lobby. Ready up for another round.');
}

export function closeRoom(room: Room, now: number) {
  room.status = 'closed';
  addLog(room, now, 'room', 'The host closed the room.');
}
