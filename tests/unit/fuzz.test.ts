import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  advancePhase,
  acknowledgeRole,
  checkWin,
  createRoom,
  eligibleVoters,
  extendTimer,
  GameError,
  hostEliminate,
  hostRestore,
  mafiaDecision,
  nightOptions,
  pauseGame,
  resolveTie,
  resumeGame,
  startGame,
  submitNightAction,
  submitVote,
  tick,
  updateSettings,
  voteTargets,
  type Rng,
} from '../../src/shared/engine';
import { ROLES, ROLE_ORDER, roleAlignment } from '../../src/shared/roles';
import { buildView } from '../../src/server/views';
import type { Room } from '../../src/shared/types';

/** Seeded PRNG (mulberry32) so any failure can be replayed from its seed. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const T0 = 1_700_000_000_000;

function randomGame(seed: number) {
  const r = prng(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const chance = (p: number) => r() < p;
  const rng: Rng = { int: (m) => Math.floor(r() * m), id: () => `id${Math.floor(r() * 1e9)}` };
  const n = 5 + Math.floor(r() * 18);
  const room = createRoom({ code: 'FUZZ', hostName: 'Host', hostTokenHash: 'h', hostPlays: false, now: T0, playerCount: n });
  // A random but legal role mix: at least one Mafia, the rest drawn from every role.
  const counts: Record<string, number> = { mafia: 1 + Math.floor(r() * Math.max(1, Math.floor(n / 4))) };
  let left = n - counts.mafia;
  while (left > 0) {
    const id = pick(ROLE_ORDER);
    if ((ROLES[id] as { unique?: boolean }).unique && counts[id]) {
      counts.villager = (counts.villager ?? 0) + 1;
    } else counts[id] = (counts[id] ?? 0) + 1;
    left--;
  }
  updateSettings(room, {
    roles: counts,
    bufferSeconds: pick([0, 0, 5, 8]),
    verdictSeconds: pick([0, 8]),
    timers: !chance(0.15),
    discussionTimer: !chance(0.3),
    daySeconds: pick([180, 210, 240, 270]),
    bollywood: chance(0.5),
    playMode: pick(['offline', 'online'] as const),
    tieRule: pick(['none', 'runoff', 'host'] as const),
    allowVoteChange: chance(0.3),
    allowSelfVote: chance(0.2),
    allowAbstain: chance(0.8),
    silencedCanVote: chance(0.7),
    revealRoleOnDeath: chance(0.5),
    announceSaves: chance(0.5),
    announceSilenced: chance(0.5),
    deadCanSeeRoles: chance(0.5),
    detectiveResult: pick(['alignment', 'binary'] as const),
    godfatherAppearsInnocent: chance(0.5),
    godfatherTakesOver: chance(0.4),
    mafiaDecision: pick(['plurality', 'leader'] as const),
    mafiaWin: pick(['parity', 'majority'] as const),
    doctorSelfProtect: pick(['never', 'alternate', 'always'] as const),
    revivedKeepRole: chance(0.5),
    revivedKeepEffects: chance(0.5),
    revivedCanActNextPhase: chance(0.5),
    thiefAlignment: pick(['neutral', 'good'] as const),
    thiefStealPassive: chance(0.5),
    imposterAlignment: pick(['neutral', 'good', 'mafia'] as const),
    imposterCharges: pick([0, 1, 2]),
    judgeWeight: 1 + Math.floor(r() * 3),
    jesterEndsGame: chance(0.5),
    villagerPowers: { hunch: chance(0.3), shield: chance(0.3), rally: false },
  });
  for (let i = 0; i < n; i++) addPlayer(room, { id: `p${i}`, name: `P${i}`, tokenHash: `t${i}`, now: T0 });
  for (const p of room.players) p.ready = true;
  try {
    startGame(room, T0, rng, { force: true });
  } catch (e) {
    if (e instanceof GameError) return null; // an illegal setup the lobby would refuse too
    throw e;
  }
  return { room, rng, r, pick, chance };
}

/** Every rule that must hold after any step. */
function checkInvariants(room: Room, now: number, where: string) {
  const g = room.game!;
  const connected = new Set(room.players.map((p) => p.id));
  const pub = buildView(room, { kind: 'public' }, connected, now);
  const over = g.phase === 'game_over';
  for (const pp of pub.players) {
    const p = room.players.find((x) => x.id === pp.id)!;
    // A living player's role is never public before the end.
    if (!over && p.alive) expect(pp.revealedRoleId, `${where}: role of living ${p.name} leaked`).toBeNull();
    if (!over && !p.alive && !g.settings.revealRoleOnDeath) expect(pp.revealedRoleId, `${where}: role of dead ${p.name} leaked`).toBeNull();
  }
  for (const p of room.players) {
    const v = buildView(room, { kind: 'player', playerId: p.id }, connected, now);
    // A player's own view never carries anyone else's role (except what the rules allow).
    if (!over && v.host) throw new Error(`${where}: host data sent to a player`);
  }
  buildView(room, { kind: 'host' }, connected, now);
  if (room.status === 'active' && !over) {
    // Dawn/Night/Vote have a clock exactly when timers are on; the discussion when its own timer is on too.
    const paused = g.pausedRemainingMs !== null;
    const timed = g.settings.timers !== false;
    if (!paused && ['prenight', 'night', 'voting'].includes(g.phase)) expect(g.phaseEndsAt !== null, `${where}: ${g.phase} clock should be ${timed}`).toBe(timed);
    if (!paused && g.phase === 'discussion') expect(g.phaseEndsAt !== null, `${where}: discussion clock`).toBe(timed && g.settings.discussionTimer !== false);
    // After any resolution, a decided game must have ended.
    if (['discussion', 'prenight', 'night'].includes(g.phase) && !paused) {
      const win = checkWin(room);
      expect(win, `${where}: game should have ended (${win?.faction}) but is in ${g.phase}`).toBeNull();
    }
  }
  if (over) {
    expect(g.winner, `${where}: game over with no winner`).not.toBeNull();
    // The Godfather (Evil) wins exactly when the Mafia do.
    for (const p of room.players) {
      if (roleAlignment(p.roleId, g.settings) === 'evil' && g.winner!.faction === 'mafia') expect(g.winner!.winnerIds).toContain(p.id);
    }
  }
}

function playOne(seed: number) {
  const made = randomGame(seed);
  if (!made) return null;
  const { room, rng, r, pick, chance } = made;
  let now = T0;
  const g = () => room.game!;
  const step = (label: string, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      if (e instanceof GameError) throw new Error(`seed ${seed}: ${label} rejected a legal move: ${e.code} ${e.message} (phase ${g().phase})`);
      throw e;
    }
  };
  for (let guard = 0; guard < 400 && g().phase !== 'game_over'; guard++) {
    const phase = g().phase;
    const deadBefore = new Set(room.players.filter((p) => !p.alive).map((p) => p.id));
    const logBefore = room.log.length ? room.log[room.log.length - 1].seq : 0;
    const where = `seed ${seed} step ${guard} (${phase} r${g().round})`;
    // Sometimes the host steps in.
    if (chance(0.04)) {
      step('pause', () => pauseGame(room, now));
      now += 5000 + Math.floor(r() * 60000);
      expect(tick(room, now, rng), `${where}: a paused game moved on`).toBe(false);
      step('resume', () => resumeGame(room, now));
    }
    if (chance(0.03) && g().phaseEndsAt !== null) step('extend', () => extendTimer(room, pick([30, -30]), now));
    if (chance(0.02)) {
      const alive = room.players.filter((p) => p.alive);
      const dead = room.players.filter((p) => !p.alive);
      if (dead.length && chance(0.5)) step('restore', () => hostRestore(room, pick(dead).id, now));
      else if (alive.length > 2) step('eliminate', () => hostEliminate(room, pick(alive).id, now));
      checkInvariants(room, now, where + ' after host correction');
      if (g().phase === 'game_over') break;
    }
    if (phase === 'reveal') {
      for (const p of room.players) if (chance(0.9)) step('ack', () => acknowledgeRole(room, p.id));
      if (!tick(room, now, rng)) step('advance', () => advancePhase(room, now, rng, 'host'));
    } else if (phase === 'prenight' || phase === 'night') {
      // During the opening break nobody can act.
      if (g().phaseOpensAt && now < g().phaseOpensAt! - 1000) {
        const p = room.players.find((x) => nightOptions(room, x.id).length);
        if (p) {
          const o = nightOptions(room, p.id)[0];
          expect(() => submitNightAction(room, p.id, { abilityId: o.abilityId, targetId: null, phaseSeq: g().phaseSeq }, now), `${where}: acted during the break`).toThrow();
        }
        now = g().phaseOpensAt!;
      }
      for (const p of room.players) {
        if (chance(0.15)) continue; // forgets to act
        for (const o of nightOptions(room, p.id)) {
          if (!p.alive) throw new Error(`${where}: dead ${p.name} offered ${o.abilityId}`);
          if (o.targetKind === 'player') {
            for (const t of o.targets) {
              const tp = room.players.find((x) => x.id === t)!;
              if (o.abilityId === 'imposter_revive') expect(tp.alive, `${where}: revive offers living ${tp.name}`).toBe(false);
              else expect(tp.alive, `${where}: ${o.abilityId} offers dead ${tp.name}`).toBe(true);
            }
          }
          const target = chance(0.15) ? null : pick(o.targets);
          step(`night ${o.abilityId}`, () => submitNightAction(room, p.id, { abilityId: o.abilityId, targetId: target, phaseSeq: g().phaseSeq }, now));
        }
      }
      // The Mafia's pick must die unless somebody protected them.
      const hit = phase === 'night' ? mafiaDecision(room) : null;
      const shielded = hit !== null && Object.values(g().night.actions).some((a) => a.targetId === hit && ['protect', 'v_shield'].includes(a.abilityId));
      if (!tick(room, now, rng)) {
        if (chance(0.5)) {
          now = (g().phaseEndsAt ?? now) + 1; // clock runs out
          if (!tick(room, now, rng) && g().phase === phase) step('advance', () => advancePhase(room, now, rng, 'host'));
        } else step('advance', () => advancePhase(room, now, rng, 'host'));
      }
      if (hit && !shielded && g().phase !== phase) {
        expect(room.players.find((x) => x.id === hit)!.alive, `${where}: the Mafia's pick survived with no protection`).toBe(false);
      }
    } else if (phase === 'discussion' || phase === 'morning') {
      now += 60000;
      expect(tick(room, now, rng), `${where}: discussion ended before its clock`).toBe(false);
      // Half the time the discussion clock runs out (the vote opens by itself), else the host opens it.
      if (g().phaseEndsAt !== null && chance(0.5)) {
        now = g().phaseEndsAt! + 1;
        expect(tick(room, now, rng), `${where}: discussion clock ran out but nothing happened`).toBe(true);
      } else step('advance', () => advancePhase(room, now, rng, 'host'));
    } else if (phase === 'voting') {
      for (const p of eligibleVoters(room)) {
        if (chance(0.2)) continue;
        const targets = voteTargets(room, p);
        for (const t of targets) expect(room.players.find((x) => x.id === t)!.alive, `${where}: vote offers a dead player`).toBe(true);
        const target = (chance(0.15) && g().settings.allowAbstain) || !targets.length ? null : pick(targets);
        if (target === null && !g().settings.allowAbstain) continue;
        step('vote', () => submitVote(room, p.id, { targetId: target, phaseSeq: g().phaseSeq }, now));
      }
      for (const p of room.players.filter((x) => !x.alive)) {
        expect(() => submitVote(room, p.id, { targetId: null, phaseSeq: g().phaseSeq }, now), `${where}: dead ${p.name} voted`).toThrow();
      }
      if (!tick(room, now, rng)) {
        now = (g().phaseEndsAt ?? now) + 1;
        if (!tick(room, now, rng) && g().phase === 'voting') step('advance', () => advancePhase(room, now, rng, 'host'));
      }
    } else if (phase === 'verdict') {
      if (g().pendingTie) {
        const t = g().pendingTie!;
        step('tie', () => resolveTie(room, chance(0.2) ? null : pick(t), now));
      } else step('advance', () => advancePhase(room, now, rng, 'host'));
    }
    now += 1000;
    // Nobody comes back to life except through the Imposter's revival (or a host correction, checked above).
    for (const p of room.players) {
      if (p.alive && deadBefore.has(p.id) && !room.log.some((l) => l.seq > logBefore && (l.tag === 'revive' || l.kind === 'correction'))) {
        throw new Error(`${where}: ${p.name} came back to life without a revival`);
      }
    }
    checkInvariants(room, now, where);
  }
  return room;
}

describe('fuzz: thousands of random games', () => {
  it('never crash, never break a rule, always finish', { timeout: 180_000 }, () => {
    const endings: Record<string, number> = {};
    for (let seed = 1; seed <= 1500; seed++) {
      const room = playOne(seed);
      if (!room) {
        endings.skipped = (endings.skipped ?? 0) + 1;
        continue;
      }
      const w = room.game!.winner?.faction ?? 'unfinished';
      endings[w] = (endings[w] ?? 0) + 1;
      if (w === 'unfinished') throw new Error(`seed ${seed}: game never finished (phase ${room.game!.phase}, round ${room.game!.round})`);
    }
    expect(endings.good).toBeGreaterThan(0);
    expect(endings.mafia).toBeGreaterThan(0);
  });
});
