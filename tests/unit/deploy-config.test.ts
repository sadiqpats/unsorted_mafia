import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveClientOrigins } from '../../src/server/config';

describe('server: allowed website origins', () => {
  it('always allows the Vercel site, even when CLIENT_ORIGIN is unset', () => {
    expect(resolveClientOrigins(undefined)).toEqual(['https://unsortedmafia.vercel.app']);
  });
  it('adds CLIENT_ORIGIN entries, trimming spaces and trailing slashes, without duplicates', () => {
    expect(resolveClientOrigins(' https://a.example/ ,https://unsortedmafia.vercel.app/')).toEqual(['https://unsortedmafia.vercel.app', 'https://a.example']);
  });
});

describe('client: which game server the website talks to', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  const load = async (hostname: string, env?: string) => {
    vi.resetModules();
    vi.stubGlobal('location', { hostname });
    if (env !== undefined) vi.stubEnv('VITE_SERVER_URL', env);
    return import('../../src/client/lib/server');
  };

  it('on Vercel without VITE_SERVER_URL, uses the Render server (was the timeout bug)', async () => {
    const m = await load('unsortedmafia.vercel.app');
    expect(m.SERVER_URL).toBe('https://mafia-night-1c5h.onrender.com');
    expect(m.serverUrl('/api/rooms')).toBe('https://mafia-night-1c5h.onrender.com/api/rooms');
  });
  it('VITE_SERVER_URL wins when set', async () => {
    const m = await load('unsortedmafia.vercel.app', 'https://other.onrender.com/');
    expect(m.SERVER_URL).toBe('https://other.onrender.com');
  });
  it('locally and on Render itself, uses the same origin', async () => {
    expect((await load('localhost')).SERVER_URL).toBe('');
    expect((await load('mafia-night-1c5h.onrender.com')).SERVER_URL).toBe('');
  });
});
