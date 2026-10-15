import { ABILITIES, ROLES } from '../../src/shared/roles';
import {
  addPlayer,
  advancePhase,
  createRoom,
  startGame,
  submitNightAction,
  submitVote,
  updateSettings,
  type Rng,
} from '../../src/shared/engine';
import type { SettingsPatch } from '../../src/shared/settings';
import type { Room } from '../../src/shared/types';

export const T0 = 1_700_000_000_000;

export function testRng(): Rng {
  let n = 1;
  return {
    int: (m) => (n = (n * 1103515245 + 12345) % 2147483648) % m,
    id: () => `r${n++}`,
  };
}

/** Build a started game where player i gets roles[i] (deterministic for tests). */
export function setup(roles: string[], patch: SettingsPatch = {}) {
  const rng = testRng();
  const room = createRoom({ code: 'TEST', hostName: 'Host', hostTokenHash: 'h', hostPlays: false, now: T0, playerCount: roles.length });
  const counts: Record<string, number> = {};
  for (const r of roles) counts[r] = (counts[r] ?? 0) + 1;
  updateSettings(room, { ...patch, roles: counts });
  roles.forEach((_, i) => addPlayer(room, { id: `p${i}`, name: `P${i}`, tokenHash: `t${i}`, now: T0 }));
  for (const p of room.players) p.ready = true;
  startGame(room, T0, rng);
  room.players.forEach((p, i) => {
    p.roleId = roles[i];
    p.originalRoleId = roles[i];
    p.charges = {};
    for (const a of ROLES[roles[i]].abilities) {
      const c = ABILITIES[a.id].charges(room.game!.settings);
      if (c !== null) p.charges[a.id] = c;
    }
  });
  let now = T0;
  const clock = () => (now += 1000);
  const id = (i: number) => `p${i}`;
  const P = (i: number) => room.players[i];
  const seq = () => room.game!.phaseSeq;
  const advance = () => advancePhase(room, clock(), rng, 'host');
  const act = (i: number, abilityId: string, target: number | null) =>
    submitNightAction(room, id(i), { abilityId, targetId: target === null ? null : id(target), phaseSeq: seq() }, clock());
  const vote = (i: number, target: number | null, rally = false) =>
    submitVote(room, id(i), { targetId: target === null ? null : id(target), rally, phaseSeq: seq() }, clock());
  /** Everyone without an explicit action skips (submits decoy/skip) so the night can resolve. */
  const goToNight = () => {
    while (room.game!.phase !== 'night') advance();
  };
  const goToVoting = () => {
    while (room.game!.phase !== 'voting') advance();
  };
  const publicLog = () => room.log.filter((l) => l.visibility === 'public').map((l) => l.text);
  const results = (i: number) => room.privateResults.filter((r) => r.playerId === id(i)).map((r) => r.text);
  return { room, rng, id, P, act, vote, advance, goToNight, goToVoting, publicLog, results, seq, clock };
}

export function gameOf(room: Room) {
  return room.game!;
}
