import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { afterAll, describe, expect, it } from 'vitest';
import { Client, createLobby, expectOk, readyAll, startServer } from '../integration/harness';

/**
 * A full 16-player table against the real server: many game nights in a row, then a reconnect storm.
 * Measures how long the server freezes (event-loop delay) and how big each phone's update is.
 * Run with: npx vitest run --config vitest.load.config.ts
 */
describe('load: a long game night with 16 players', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  const clients: Client[] = [];
  afterAll(async () => {
    for (const c of clients) c.close?.();
    await srv?.server.close();
  });

  it('stays responsive', async () => {
    srv = await startServer();
    const h = monitorEventLoopDelay({ resolution: 5 });
    h.enable();
    const l = await createLobby(srv.base, 16);
    clients.push(l.host, ...l.players.map((p) => p.client));
    const tv = new Client(srv.base, { code: l.code, display: true });
    await tv.connected();
    clients.push(tv);
    await l.host.send({ type: 'update_settings', patch: { verdictSeconds: 0 } });
    await readyAll(l.players);
    const t0 = performance.now();
    const cpu0 = process.cpuUsage();
    let games = 0;
    let rounds = 0;
    for (; games < 6; games++) {
      expectOk(await l.host.send({ type: 'start' }));
      await l.host.waitFor((v) => v.game?.phase === 'reveal');
      for (const p of l.players) await p.client.send({ type: 'ack_role' });
      const next = async () => {
        const g = l.host.view!.game!;
        await l.host.send({ type: 'advance', phaseSeq: g.phaseSeq });
        await l.host.waitFor((v) => v.game!.phaseSeq !== g.phaseSeq).catch(() => undefined);
      };
      for (let r = 0; r < 4 && l.host.view?.game?.phase !== 'game_over'; r++) {
        for (let i = 0; i < 6 && !['voting', 'game_over'].includes(l.host.view!.game!.phase); i++) await next();
        if (l.host.view!.game!.phase !== 'voting') break;
        const alive = l.host.view!.players.filter((p) => p.alive && !p.isHost);
        const target = alive[alive.length - 1];
        const seq = l.host.view!.game!.phaseSeq;
        await Promise.all(l.players.map((p) => p.client.send({ type: 'vote', targetId: target.id, phaseSeq: seq }).catch(() => null)));
        await l.host.waitFor((v) => v.game!.phaseSeq !== seq).catch(() => undefined);
        rounds++;
      }
      if (l.host.view!.game!.phase !== 'game_over') {
        await l.host.send({ type: 'end_game' });
        await l.host.waitFor((v) => v.game?.phase === 'game_over').catch(() => undefined);
      }
      expectOk(await l.host.send({ type: 'restart' }));
      await l.host.waitFor((v) => v.status === 'lobby').catch(() => undefined);
      await readyAll(l.players);
    }
    const playMs = performance.now() - t0;
    const cpu = process.cpuUsage(cpu0);
    const cpu1 = process.cpuUsage();
    // A reconnect storm: every phone drops and comes back at once, three times.
    const t1 = performance.now();
    for (let k = 0; k < 3; k++) {
      await Promise.all(l.players.map(async (p) => {
        p.client.socket.disconnect();
        p.client.socket.connect();
      }));
      await new Promise((r2) => setTimeout(r2, 400));
    }
    const stormMs = performance.now() - t1;
    const stormCpu = process.cpuUsage(cpu1);
    h.disable();
    const sizes = l.players[0].client.payloads.slice(-20).map((s) => s.length);
    const room = srv.server.service.get(l.code)!;
    const report = {
      games, rounds, playSeconds: +(playMs / 1000).toFixed(1), stormSeconds: +(stormMs / 1000).toFixed(1),
      cpuMsPerRound: +((cpu.user + cpu.system) / 1000 / rounds).toFixed(0), stormCpuMs: +((stormCpu.user + stormCpu.system) / 1000).toFixed(0),
      maxFreezeMs: +(h.max / 1e6).toFixed(1), p99FreezeMs: +(h.percentile(99) / 1e6).toFixed(1),
      phoneUpdateKB: +(Math.max(...sizes) / 1024).toFixed(1), savedRoomKB: +(JSON.stringify(room).length / 1024).toFixed(1), logEntries: room.log.length,
    };
    console.log('LOAD', JSON.stringify(report));
    const last = JSON.parse(l.players[0].client.payloads.at(-1)!);
    const parts = Object.fromEntries(Object.entries(last).map(([k, v]) => [k, JSON.stringify(v ?? null).length]).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 8));
    console.log('PARTS', JSON.stringify(parts));
    const sett = Object.fromEntries(Object.entries(last.settings ?? {}).map(([k, v]) => [k, JSON.stringify(v).length]).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 4));
    console.log('SETTINGS', JSON.stringify(sett));
    expect(report.maxFreezeMs).toBeLessThan(250);
  }, 300_000);
});
