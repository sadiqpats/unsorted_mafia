import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client, createLobby, expectOk, readyAll, startServer } from './harness';

let srv: Awaited<ReturnType<typeof startServer>>;
const clients: Client[] = [];
beforeEach(async () => {
  srv = await startServer();
});
afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await srv.server.close();
});

const jpeg = (bytes = 2000) => 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(bytes, 7)]).toString('base64');
const upload = (code: string, token: string | null, photo: string | null) =>
  fetch(`${srv.base}/api/rooms/${code}/photo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ photo }),
  });

describe('player photos', () => {
  it('uploads, broadcasts a URL to everyone (never the bytes) and serves the image', async () => {
    const l = await createLobby(srv.base, 5);
    clients.push(l.host, ...l.players.map((p) => p.client));
    const me = l.players[0];
    const res = await upload(l.code, me.token, jpeg());
    expect(res.status).toBe(200);
    const { photo } = await res.json();
    expect(photo).toMatch(new RegExp(`^/api/rooms/${l.code}/photos/${me.id}\\?v=1$`));
    const v = await l.players[3].client.waitFor((x) => !!x.players.find((p) => p.id === me.id)?.photo);
    expect(v.players.find((p) => p.id === me.id)!.photo).toBe(photo);
    expect(l.players[3].client.payloads.join('')).not.toContain('base64');
    const img = await fetch(srv.base + photo);
    expect(img.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await img.arrayBuffer()).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  it('rejects non-images, spoofed types, oversize files and missing/forged tokens', async () => {
    const l = await createLobby(srv.base, 5);
    clients.push(l.host, ...l.players.map((p) => p.client));
    const t = l.players[0].token;
    expect((await upload(l.code, t, 'data:text/html;base64,PGgxPg==')).status).toBe(400);
    expect((await upload(l.code, t, 'data:image/png;base64,' + Buffer.from('not a png at all').toString('base64'))).status).toBe(400);
    expect((await upload(l.code, t, jpeg(160_000))).status).toBe(400);
    expect((await upload(l.code, null, jpeg())).status).toBe(401);
    expect((await upload(l.code, 'x'.repeat(43), jpeg())).status).toBe(401);
  });

  it('players can clear their own photo; the host can remove anyone’s; kicking deletes it', async () => {
    const l = await createLobby(srv.base, 5);
    clients.push(l.host, ...l.players.map((p) => p.client));
    const [a, b, c] = l.players;
    for (const p of [a, b, c]) expect((await upload(l.code, p.token, jpeg())).status).toBe(200);
    expect((await upload(l.code, a.token, null)).status).toBe(200);
    await l.host.waitFor((v) => v.players.find((p) => p.id === a.id)!.photo === null);
    expect(((await b.client.send({ type: 'remove_photo', playerId: c.id })).error?.code)).toBe('forbidden');
    const bUrl = l.host.view!.players.find((p) => p.id === b.id)!.photo!;
    expectOk(await l.host.send({ type: 'remove_photo', playerId: b.id }));
    expect((await fetch(srv.base + bUrl)).status).toBe(404);
    const cUrl = l.host.view!.players.find((p) => p.id === c.id)!.photo!;
    expectOk(await l.host.send({ type: 'kick', playerId: c.id }));
    expect((await fetch(srv.base + cUrl)).status).toBe(404);
  });

  it('photos survive a new game and a server restart, and stay attached to eliminated players', async () => {
    const l = await createLobby(srv.base, 5);
    clients.push(l.host, ...l.players.map((p) => p.client));
    await upload(l.code, l.players[0].token, jpeg());
    await readyAll(l.players);
    expectOk(await l.host.send({ type: 'start' }));
    const v = await l.host.waitFor((x) => x.game?.phase === 'reveal');
    expectOk(await l.host.send({ type: 'eliminate', playerId: l.players[0].id }));
    const after = await l.host.waitFor((x) => x.players.find((p) => p.id === l.players[0].id)!.alive === false);
    const url = after.players.find((p) => p.id === l.players[0].id)!.photo!;
    expect(url).toBeTruthy();
    expect(v.code).toBe(l.code);
    for (const c of clients.splice(0)) c.close();
    await srv.server.close();
    srv = await startServer(srv.dbPath);
    expect((await fetch(srv.base + url)).status).toBe(200);
  });
});
