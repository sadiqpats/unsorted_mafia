import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createApp } from '../../src/server/app';

let server: ReturnType<typeof createApp> | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});
const start = async (hostCode: string | null | undefined) => {
  server = createApp({ dbPath: join(mkdtempSync(join(tmpdir(), 'mafia-')), 'h.db'), hostCode });
  return `http://127.0.0.1:${await server.listen(0, '127.0.0.1')}`;
};
const create = (base: string, hostCode?: string) =>
  fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hostName: 'Host', hostCode }) });

it('only someone with the host code can host; anyone can still join', async () => {
  const base = await start('135246');
  expect((await create(base)).status).toBe(403);
  expect((await create(base, '000000')).status).toBe(403);
  const ok = await create(base, '135246');
  expect(ok.status).toBe(201);
  const { code } = await ok.json();
  const join = await fetch(`${base}/api/rooms/${code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Guest' }) });
  expect(join.status).toBe(201); // players never need the code
});

it('locks an address out after 5 wrong codes (no brute forcing)', async () => {
  const base = await start('135246');
  for (let i = 0; i < 5; i++) expect((await create(base, `11111${i}`)).status).toBe(403);
  const locked = await create(base, '135246');
  expect(locked.status).toBe(429);
  expect((await locked.json()).error.code).toBe('locked');
});

it('production without HOST_CODE refuses to host instead of letting anyone in', async () => {
  const base = await start(null);
  const r = await create(base, '135246');
  expect(r.status).toBe(503);
  expect((await r.json()).error.code).toBe('hosting_disabled');
});
