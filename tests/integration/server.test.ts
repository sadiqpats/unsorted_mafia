import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientView } from '../../src/shared/view-types';
import { Client, api, createLobby, expectOk, readyAll, startServer } from './harness';

type Srv = Awaited<ReturnType<typeof startServer>>;
let srv: Srv;
const clients: Client[] = [];
const track = <T extends { host: Client; players: { client: Client }[] }>(l: T) => {
  clients.push(l.host, ...l.players.map((p) => p.client));
  return l;
};

beforeEach(async () => {
  srv = await startServer();
});
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await srv.server.close();
});

/** Collect every role id that appears anywhere in a payload. */
function rolesInPayload(v: ClientView): { where: string; playerId?: string; roleId: string }[] {
  const out: { where: string; playerId?: string; roleId: string }[] = [];
  for (const p of v.players) if (p.revealedRoleId) out.push({ where: 'revealed', playerId: p.id, roleId: p.revealedRoleId });
  if (v.me?.roleId) out.push({ where: 'me', playerId: v.me.id, roleId: v.me.roleId });
  for (const t of v.me?.mafia?.team ?? []) out.push({ where: 'mafia', playerId: t.id, roleId: t.roleId });
  for (const [id, r] of Object.entries(v.me?.allRoles ?? {})) out.push({ where: 'allRoles', playerId: id, roleId: r });
  for (const [id, r] of Object.entries(v.host?.roles ?? {})) out.push({ where: 'host', playerId: id, roleId: r });
  return out;
}

async function startedGame(n: number, roles?: Record<string, number>) {
  const lobby = track(await createLobby(srv.base, n));
  if (roles) expectOk(await lobby.host.send({ type: 'update_settings', patch: { roles } }));
  await readyAll(lobby.players);
  expectOk(await lobby.host.send({ type: 'start' }));
  const hv = await lobby.host.waitFor((v) => v.game?.phase === 'reveal');
  const roleOf = (id: string) => hv.host!.roles![id];
  for (const p of lobby.players) await p.client.waitFor((v) => v.game?.phase === 'reveal' && !!v.me?.roleId);
  return { ...lobby, roleOf };
}

async function toPhase(c: Client, host: Client, phase: string) {
  for (let i = 0; i < 10; i++) {
    const v = await host.waitFor((x) => !!x.game);
    if (v.game!.phase === phase) break;
    expectOk(await host.send({ type: 'advance', phaseSeq: v.game!.phaseSeq }));
    await host.waitFor((x) => x.game!.phaseSeq > v.game!.phaseSeq);
  }
  return c.waitFor((v) => v.game?.phase === phase);
}

describe('rooms over HTTP', () => {
  it('creates a room and joins with the code', async () => {
    const c = await api(srv.base, '/api/rooms', { hostName: 'Ana', playerCount: 6 });
    expect(c.status).toBe(201);
    expect(c.body.code).toMatch(/^[A-Z2-9]{5}$/);
    const info = await api(srv.base, `/api/rooms/${c.body.code}`);
    expect(info.body).toMatchObject({ status: 'lobby', capacity: 6, players: 0, joinable: true });
    expect(JSON.stringify(info.body)).not.toMatch(/token|role/i);
    const j = await api(srv.base, `/api/rooms/${c.body.code.toLowerCase()}/join`, { name: 'Ben' });
    expect(j.status).toBe(201);
    expect(j.body.token).toHaveLength(43);
  });

  it('gives clear errors for invalid, duplicate, full and started rooms', async () => {
    expect((await api(srv.base, '/api/rooms/ZZZZZ')).status).toBe(404);
    expect((await api(srv.base, '/api/rooms/ZZZZZ/join', { name: 'x' })).status).toBe(404);
    const lobby = track(await createLobby(srv.base, 5));
    const dup = await api(srv.base, `/api/rooms/${lobby.code}/join`, { name: 'player1' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('name_taken');
    const full = await api(srv.base, `/api/rooms/${lobby.code}/join`, { name: 'Extra' });
    expect(full.body.error.code).toBe('room_full');
    await readyAll(lobby.players);
    expectOk(await lobby.host.send({ type: 'start' }));
    expect((await api(srv.base, `/api/rooms/${lobby.code}`)).body.reason).toMatch(/in progress/);
  });

  it('validates input', async () => {
    expect((await api(srv.base, '/api/rooms', { hostName: '' })).status).toBe(400);
    expect((await api(srv.base, '/api/rooms', { hostName: 'A', playerCount: 23 })).status).toBe(400);
    expect((await api(srv.base, '/api/rooms', { hostName: 'A', playerCount: 4 })).status).toBe(400);
  });
});

describe('authentication & authorization', () => {
  it('rejects sockets with a forged token', async () => {
    const lobby = track(await createLobby(srv.base, 5));
    const bad = new Client(srv.base, { code: lobby.code, token: 'x'.repeat(43) });
    clients.push(bad);
    await expect(bad.connected()).rejects.toThrow(/unauthorized/);
  });

  it('players cannot run host commands, and a player token never grants host rights', async () => {
    const lobby = track(await createLobby(srv.base, 5));
    const p = lobby.players[0].client;
    for (const type of ['start', 'pause', 'close_room'] as const) {
      const a = await p.send({ type } as never);
      expect(a.error?.code).toBe('forbidden');
    }
    expect((await p.send({ type: 'kick', playerId: lobby.players[1].id })).error?.code).toBe('forbidden');
    expect(p.view!.host).toBeNull();
  });

  it('rejects malformed commands', async () => {
    const lobby = track(await createLobby(srv.base, 5));
    const p = lobby.players[0].client;
    expect((await p.sendRaw({ type: 'vote', actionId: 'short' })).error?.code).toBe('bad_request');
    expect((await p.sendRaw({ type: 'hack_the_planet', actionId: 'aaaaaaaaaa' })).error?.code).toBe('bad_request');
    expect((await p.sendRaw('nope')).error?.code).toBe('bad_request');
  });

  it('display screens are read-only and receive only public data', async () => {
    const g = await startedGame(5);
    const tv = new Client(srv.base, { code: g.code, display: true });
    clients.push(tv);
    await tv.connected();
    const v = await tv.waitFor((x) => !!x.game);
    expect(v.me).toBeNull();
    expect(v.host).toBeNull();
    expect(rolesInPayload(v)).toEqual([]);
    expect((await tv.send({ type: 'ready', ready: true })).error?.code).toBe('forbidden');
  });

  it('a kicked player is disconnected and their token stops working', async () => {
    const lobby = track(await createLobby(srv.base, 5));
    const victim = lobby.players[2];
    expectOk(await lobby.host.send({ type: 'kick', playerId: victim.id }));
    await new Promise((r) => setTimeout(r, 150));
    expect(victim.client.ended).toMatch(/removed/);
    const again = new Client(srv.base, { code: lobby.code, token: victim.token });
    clients.push(again);
    await expect(again.connected()).rejects.toThrow(/unauthorized/);
  });

  it('closing the room ends every session', async () => {
    const lobby = track(await createLobby(srv.base, 5));
    expectOk(await lobby.host.send({ type: 'close_room' }));
    await new Promise((r) => setTimeout(r, 150));
    expect(lobby.players.every((p) => p.client.ended)).toBe(true);
    expect((await api(srv.base, `/api/rooms/${lobby.code}`)).status).toBe(404);
  });
});

describe('secret role privacy', () => {
  it('each player receives only their own role — across every payload of a whole round', async () => {
    const g = await startedGame(8);
    // Play one full round so payloads include night, morning, voting.
    const mafiaIds = g.players.filter((p) => ['mafia', 'godfather'].includes(g.roleOf(p.id))).map((p) => p.id);
    await toPhase(g.host, g.host, 'night');
    for (const p of g.players) {
      const v = await p.client.waitFor((x) => x.game?.phase === 'night' && !!x.me?.night);
      for (const opt of v.me!.night!.options) {
        expectOk(await p.client.send({ type: 'night_action', abilityId: opt.abilityId, targetId: null, phaseSeq: v.game!.phaseSeq }));
      }
    }
    await g.host.waitFor((v) => v.game?.phase === 'voting');
    await toPhase(g.host, g.host, 'voting');

    for (const p of g.players) {
      const isMafia = mafiaIds.includes(p.id);
      for (const raw of p.client.payloads) {
        const v = JSON.parse(raw) as ClientView;
        expect(v.host).toBeNull();
        for (const r of rolesInPayload(v)) {
          if (r.where === 'me') expect(r.playerId).toBe(p.id);
          else if (r.where === 'mafia') {
            expect(isMafia).toBe(true);
            expect(mafiaIds).toContain(r.playerId);
          } else throw new Error(`Player ${p.name} saw a role via ${r.where}`);
        }
        if (!isMafia) expect(v.me?.mafia ?? null).toBeNull();
      }
    }
  });

  it('investigation results reach only the Detective', async () => {
    const g = await startedGame(5, { mafia: 1, detective: 1, villager: 3 });
    const det = g.players.find((p) => g.roleOf(p.id) === 'detective')!;
    const maf = g.players.find((p) => g.roleOf(p.id) === 'mafia')!;
    await toPhase(det.client, g.host, 'night');
    const v = await det.client.waitFor((x) => !!x.me?.night);
    expectOk(await det.client.send({ type: 'night_action', abilityId: 'investigate', targetId: maf.id, phaseSeq: v.game!.phaseSeq }));
    const hv = g.host.view!;
    expectOk(await g.host.send({ type: 'advance', phaseSeq: hv.game!.phaseSeq }));
    const after = await det.client.waitFor((x) => (x.me?.privateResults.length ?? 0) > 0);
    expect(after.me!.privateResults[0].text).toMatch(/SUSPICIOUS/);
    for (const p of g.players.filter((x) => x.id !== det.id)) {
      expect(p.client.payloads.join('')).not.toMatch(/SUSPICIOUS/);
    }
  });

  it('a playing host gets no secrets on their dashboard', async () => {
    const lobby = track(await createLobby(srv.base, 5, { hostPlays: true }));
    await readyAll(lobby.players);
    expectOk(await lobby.host.send({ type: 'start' }));
    const v = await lobby.host.waitFor((x) => x.game?.phase === 'reveal' && !!x.me?.roleId);
    expect(v.host!.secrets).toBe(false);
    expect(v.host!.roles).toBeNull();
    expect(v.host!.nightActions).toBeNull();
    expect(v.host!.log.every((l) => l.visibility === 'public')).toBe(true);
  });
});

describe('gameplay over the network', () => {
  it('plays a 5-player match to a Town victory with synchronized clients', async () => {
    const g = await startedGame(5, { mafia: 1, doctor: 1, villager: 3 });
    const maf = g.players.find((p) => g.roleOf(p.id) === 'mafia')!;
    const others = g.players.filter((p) => p.id !== maf.id);
    for (const p of g.players) expectOk(await p.client.send({ type: 'ack_role' }));
    // all acknowledged → server auto-advances to night
    await Promise.all(g.players.map((p) => p.client.waitFor((v) => v.game?.phase === 'night')));
    const seq = g.host.view!.game!.phaseSeq;
    expectOk(await maf.client.send({ type: 'night_action', abilityId: 'mafia_kill', targetId: others[0].id, phaseSeq: seq }));
    for (const p of others) {
      const v = await p.client.waitFor((x) => !!x.me?.night);
      expectOk(await p.client.send({ type: 'night_action', abilityId: v.me!.night!.options[0].abilityId, targetId: null, phaseSeq: seq }));
    }
    // last action resolves the night immediately (nightAutoResolve)
    const morning = await others[1].client.waitFor((v) => v.game?.phase === 'voting');
    expect(morning.players.find((p) => p.id === others[0].id)!.alive).toBe(false);
    expect(morning.feed.map((f) => f.text).join()).toContain(`${others[0].name} was found dead`);
    // dead player cannot vote
    await toPhase(others[1].client, g.host, 'voting');
    const vseq = g.host.view!.game!.phaseSeq;
    expect((await others[0].client.send({ type: 'vote', targetId: maf.id, phaseSeq: vseq })).error?.code).toBe('not_eligible');
    for (const p of others.slice(1)) expectOk(await p.client.send({ type: 'vote', targetId: maf.id, phaseSeq: vseq }));
    expectOk(await maf.client.send({ type: 'vote', targetId: others[1].id, phaseSeq: vseq }));
    const over = await Promise.all(g.players.map((p) => p.client.waitFor((v) => v.game?.phase === 'game_over')));
    for (const v of over) {
      expect(v.game!.winner!.faction).toBe('good');
      expect(v.players.every((p) => !!p.revealedRoleId)).toBe(true);
    }
    expect(over[0].game!.lastVerdict!.tally[maf.id]).toBe(3);
  });

  it('ignores duplicate (replayed) commands and rejects stale phases', async () => {
    const g = await startedGame(5, { mafia: 1, doctor: 1, villager: 3 });
    await toPhase(g.host, g.host, 'voting');
    const voter = g.players[0];
    const target = g.players[1];
    const seq = g.host.view!.game!.phaseSeq;
    const cmd = { type: 'vote', targetId: target.id, phaseSeq: seq, actionId: 'replay-1234567' };
    expectOk(await voter.client.sendRaw(cmd));
    expect(await voter.client.sendRaw(cmd)).toMatchObject({ ok: true, duplicate: true });
    expect((await voter.client.send({ type: 'vote', targetId: target.id, phaseSeq: seq })).error?.code).toBe('already_voted');
    expect((await g.players[2].client.send({ type: 'vote', targetId: target.id, phaseSeq: seq - 1 })).error?.code).toBe('phase_closed');
    // host double-click on "next" only advances once
    const a = g.host.send({ type: 'advance', phaseSeq: seq });
    const b = g.host.send({ type: 'advance', phaseSeq: seq });
    const res = await Promise.all([a, b]);
    expect(res.filter((r) => r.ok)).toHaveLength(1);
  });

  it('rate-limits floods of commands', async () => {
    const lobby = track(await createLobby(srv.base, 5));
    const p = lobby.players[0].client;
    const acks = await Promise.all(Array.from({ length: 60 }, (_, i) => p.send({ type: 'ready', ready: i % 2 === 0 })));
    expect(acks.some((a) => a.error?.code === 'rate_limited')).toBe(true);
  });

  it('broadcasts lobby changes in real time', async () => {
    const lobby = track(await createLobby(srv.base, 6, { seats: 5 }));
    await lobby.host.waitFor((v) => v.players.length === 5);
    await api(srv.base, `/api/rooms/${lobby.code}/join`, { name: 'Late Arrival' });
    await lobby.host.waitFor((v) => v.players.some((p) => p.name === 'Late Arrival'));
    expectOk(await lobby.players[0].client.send({ type: 'ready', ready: true }));
    await lobby.players[3].client.waitFor((v) => v.players.find((p) => p.name === 'Player1')!.ready);
  });
});

describe('reconnection & persistence', () => {
  it('a player who refreshes gets the same seat, role and phase back', async () => {
    const g = await startedGame(5);
    const p = g.players[3];
    const role = p.client.view!.me!.roleId;
    p.client.close();
    await g.host.waitFor((v) => v.players.find((x) => x.id === p.id)!.connected === false);
    const again = new Client(srv.base, { code: g.code, token: p.token });
    clients.push(again);
    await again.connected();
    const v = await again.waitFor((x) => !!x.me);
    expect(v.me!.id).toBe(p.id);
    expect(v.me!.roleId).toBe(role);
    expect(v.game!.phase).toBe('reveal');
    await g.host.waitFor((x) => x.players.find((y) => y.id === p.id)!.connected === true);
  });

  it('the game survives a full server restart', async () => {
    const g = await startedGame(5);
    await toPhase(g.host, g.host, 'voting');
    const before = g.host.view!;
    for (const c of clients.splice(0)) c.close();
    await srv.server.close();
    srv = await startServer(srv.dbPath);
    const host = new Client(srv.base, { code: g.code, token: g.hostToken });
    const pl = new Client(srv.base, { code: g.code, token: g.players[0].token });
    clients.push(host, pl);
    await host.connected();
    await pl.connected();
    const hv = await host.waitFor((v) => !!v.game);
    expect(hv.game!.phase).toBe('voting');
    expect(hv.game!.round).toBe(before.game!.round);
    expect(hv.host!.roles).toEqual(before.host!.roles);
    const pv = await pl.waitFor((v) => !!v.me);
    expect(pv.me!.roleId).toBe(before.host!.roles![g.players[0].id]);
  });

  it('a host-issued rejoin code moves a seat to a new phone and logs the old one out', async () => {
    const g = await startedGame(5);
    const p = g.players[1];
    const ack = expectOk(await g.host.send({ type: 'issue_rejoin', playerId: p.id }));
    const code = ack.data!.rejoinCode as string;
    expect((await api(srv.base, `/api/rooms/${g.code}/rejoin`, { rejoinCode: 'WRONG1' })).status).toBe(400);
    const r = await api(srv.base, `/api/rooms/${g.code}/rejoin`, { rejoinCode: code });
    expect(r.body.playerId).toBe(p.id);
    const fresh = new Client(srv.base, { code: g.code, token: r.body.token });
    clients.push(fresh);
    await fresh.connected();
    const v = await fresh.waitFor((x) => !!x.me);
    expect(v.me!.roleId).toBe(g.roleOf(p.id));
    await new Promise((res) => setTimeout(res, 150));
    expect(p.client.ended).toMatch(/another device/);
    // the code is single-use
    expect((await api(srv.base, `/api/rooms/${g.code}/rejoin`, { rejoinCode: code })).status).toBe(400);
  });

  it('records an audit log of commands', async () => {
    const lobby = track(await createLobby(srv.base, 5));
    await lobby.players[0].client.send({ type: 'start' } as never);
    const audit = srv.server.store.auditFor(lobby.code);
    expect(audit.some((a) => a.action === 'join')).toBe(true);
    expect(audit.some((a) => a.action === 'start' && a.ok === 0 && a.detail === 'forbidden')).toBe(true);
  });
});
