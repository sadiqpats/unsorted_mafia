import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app';

let srv: ReturnType<typeof createApp>;
let base = '';
beforeEach(async () => {
  srv = createApp({ dbPath: ':memory:', hostCode: 'secret' });
  base = `http://127.0.0.1:${await srv.listen(0, '127.0.0.1')}`;
});
afterEach(async () => {
  await srv.close();
});
const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('Dumb Charades over HTTP', () => {
  it('hosting needs the host code; captains claim one seat per team; suggestions return titles only', async () => {
    expect((await post('/api/charades/rooms', { hostName: 'Judge', hostCode: 'nope' })).status).toBe(403);
    const created = await post('/api/charades/rooms', { hostName: 'Judge', hostCode: 'secret' });
    expect(created.status).toBe(201);
    const { code } = await created.json();
    expect((await post(`/api/charades/rooms/${code}/join`, { team: 0, name: 'Asha' })).status).toBe(201);
    const again = await post(`/api/charades/rooms/${code}/join`, { team: 0, name: 'Bina' });
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe('seat_taken');
    const info = await (await fetch(`${base}/api/charades/rooms/${code}`)).json();
    expect(info.teams).toEqual([
      { name: 'Team 1', captain: 'Asha' },
      { name: 'Team 2', captain: null },
    ]);
    const s = await (await fetch(`${base}/api/charades/suggest?q=dhoom`)).json();
    expect(s.titles).toEqual(expect.arrayContaining(['Dhoom', 'Dhoom 2', 'Dhoom 3']));
    expect((await fetch(`${base}/api/charades/rooms/ZZZZZ`)).status).toBe(404);
  });
});

describe('liveness probe', () => {
  it('both games answer the "are you there?" probe instantly', async () => {
    const { io } = await import('socket.io-client');
    const created = await (await post('/api/charades/rooms', { hostName: 'Judge', hostCode: 'secret' })).json();
    const mafia = await (await post('/api/rooms', { hostName: 'GM', hostCode: 'secret', playerCount: 5 })).json();
    for (const [ns, code, token] of [['/charades', created.code, created.token], ['', mafia.code, mafia.token]] as const) {
      const s = io(base + ns, { auth: { code, token }, transports: ['websocket'], forceNew: true, reconnection: false });
      const ok = await new Promise((resolve) => s.timeout(2000).emit('alive', (err: unknown, v: boolean) => resolve(!err && v)));
      expect(ok).toBe(true);
      s.close();
    }
  });
});
