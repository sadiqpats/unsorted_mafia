import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { createApp } from '../../src/server/app';
import type { Ack, CommandInput } from '../../src/shared/protocol';
import type { ClientView } from '../../src/shared/view-types';

export async function startServer(dbPath?: string) {
  const path = dbPath ?? join(mkdtempSync(join(tmpdir(), 'mafia-')), 'test.db');
  const server = createApp({ dbPath: path, tickMs: 50 });
  const port = await server.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  return { server, port, base, dbPath: path };
}

export async function api<T = any>(base: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

export class Client {
  socket: Socket;
  view: ClientView | null = null;
  /** Every payload ever received — used to prove secrets never leak. */
  payloads: string[] = [];
  ended: string | null = null;

  constructor(base: string, auth: Record<string, unknown>) {
    this.socket = io(base, { auth, transports: ['websocket'], reconnection: false, forceNew: true });
    this.socket.on('state', (v: ClientView) => {
      this.view = v;
      this.payloads.push(JSON.stringify(v));
    });
    this.socket.on('session_ended', (e: { reason: string }) => (this.ended = e.reason));
  }

  connected(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket.connected) return resolve();
      this.socket.once('connect', () => resolve());
      this.socket.once('connect_error', (e) => reject(e));
    });
  }

  send(cmd: CommandInput): Promise<Ack> {
    return new Promise((resolve) => this.socket.emit('cmd', { ...cmd, actionId: randomUUID() }, resolve));
  }

  sendRaw(cmd: unknown): Promise<Ack> {
    return new Promise((resolve) => this.socket.emit('cmd', cmd, resolve));
  }

  async waitFor(pred: (v: ClientView) => boolean, timeout = 4000): Promise<ClientView> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (this.view && pred(this.view)) return this.view;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('Timed out waiting for state. Last view phase: ' + this.view?.game?.phase + ' status: ' + this.view?.status);
  }

  close() {
    this.socket.disconnect();
  }
}

/** Create a room + n players over the real HTTP/WebSocket API. */
export async function createLobby(base: string, n: number, opts: { hostPlays?: boolean; seats?: number } = {}) {
  const created = await api(base, '/api/rooms', { hostName: 'Gamemaster', playerCount: n, hostPlays: !!opts.hostPlays });
  const { code, token: hostToken } = created.body;
  const host = new Client(base, { code, token: hostToken });
  await host.connected();
  const players: { client: Client; id: string; token: string; name: string }[] = [];
  const seats = opts.seats ?? (opts.hostPlays ? n - 1 : n);
  for (let i = 0; i < seats; i++) {
    const name = `Player${i + 1}`;
    const j = await api(base, `/api/rooms/${code}/join`, { name });
    const client = new Client(base, { code, token: j.body.token });
    await client.connected();
    players.push({ client, id: j.body.playerId, token: j.body.token, name });
  }
  // No opening break between phases in tests (it's covered by unit tests).
  await host.send({ type: 'update_settings', patch: { bufferSeconds: 0 } });
  return { code, host, hostToken, players };
}

export async function readyAll(players: { client: Client }[]) {
  for (const p of players) expectOk(await p.client.send({ type: 'ready', ready: true }));
}

export function expectOk(a: Ack) {
  if (!a.ok) throw new Error(`Command failed: ${a.error?.code} ${a.error?.message}`);
  return a;
}
