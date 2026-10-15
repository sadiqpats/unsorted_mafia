import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io } from 'socket.io-client';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApp } from '../../src/server/app';

// Website on Vercel, game server on Render: only the configured origin may call the API.
const SITE = 'https://unsorted-mafia.vercel.app';
let server: ReturnType<typeof createApp>;
let base = '';
beforeAll(async () => {
  server = createApp({ dbPath: join(mkdtempSync(join(tmpdir(), 'mafia-')), 'c.db'), corsOrigin: [SITE] });
  base = `http://127.0.0.1:${await server.listen(0, '127.0.0.1')}`;
});
afterAll(() => server.close());

it('answers preflight and API calls for the allowed website origin only', async () => {
  const pre = await fetch(`${base}/api/rooms`, { method: 'OPTIONS', headers: { origin: SITE, 'access-control-request-method': 'POST' } });
  expect(pre.status).toBe(204);
  expect(pre.headers.get('access-control-allow-origin')).toBe(SITE);
  expect(pre.headers.get('access-control-allow-headers')).toContain('authorization');
  const ok = await fetch(`${base}/api/health`, { headers: { origin: SITE } });
  expect(ok.headers.get('access-control-allow-origin')).toBe(SITE);
  const evil = await fetch(`${base}/api/health`, { headers: { origin: 'https://evil.example' } });
  expect(evil.headers.get('access-control-allow-origin')).toBeNull();
});

it('accepts WebSocket connections from the website origin', async () => {
  const r = await fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json', origin: SITE }, body: JSON.stringify({ hostName: 'Host' }) });
  const { code, token } = await r.json();
  const s = io(base, { auth: { code, token }, transports: ['polling'], extraHeaders: { origin: SITE }, forceNew: true, reconnection: false });
  const view = await new Promise<{ code: string }>((res, rej) => {
    s.on('state', res);
    s.on('connect_error', rej);
  });
  expect(view.code).toBe(code);
  s.close();
});
