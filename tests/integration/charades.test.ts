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
