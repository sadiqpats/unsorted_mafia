import type { Express, NextFunction, Request, Response } from 'express';
import type { Server as IOServer, Socket } from 'socket.io';
import { z } from 'zod';
import { CharadesError } from '../../shared/charades/engine';
import type { TeamIdx } from '../../shared/charades/types';
import type { Store } from '../store';
import { CharadesService, type CIdentity } from './service';
import { buildCView, type CViewer } from './views';

interface Deps {
  app: Express;
  io: IOServer;
  store: Store;
  rng: { int: (max: number) => number; id: () => string };
  limit: (req: Request, res: Response, next: NextFunction) => void;
  checkHostCode: (ip: string, given: string | undefined) => { status: number; code: string; message: string } | null;
  roomTtlMs: number;
  allowSocket: (socketId: string) => boolean;
}

interface SockData {
  code: string;
  identity: CIdentity | null; // null = TV display
}

const CodeSchema = z.string().regex(/^[A-Za-z0-9]{4,8}$/);
const NameSchema = z.string().trim().min(1).max(24);
const CreateSchema = z.object({ hostName: NameSchema, hostCode: z.string().max(64).optional() });
const JoinSchema = z.object({ name: NameSchema, team: z.union([z.literal(0), z.literal(1)]) });

/** Bollywood Dumb Charades: HTTP routes under /api/charades and the realtime channel on the /charades namespace. */
export function mountCharades(d: Deps) {
  const nsp = d.io.of('/charades');

  const broadcast = (code: string) => {
    const room = service.get(code);
    if (!room) return;
    const online = service.online(code);
    const now = Date.now();
    for (const sid of nsp.adapter.rooms.get(`c:${code}`) ?? []) {
      const s = nsp.sockets.get(sid);
      if (!s) continue;
      const data = s.data as SockData;
      const viewer: CViewer = data.identity ? service.viewerOf(data.identity) : { kind: 'tv' };
      s.emit('state', buildCView(room, viewer, online, now));
    }
  };

  const service = new CharadesService({
    store: d.store,
    rng: d.rng,
    roomTtlMs: d.roomTtlMs,
    onChange: (code) => broadcast(code),
    onSessionEnded: (code, who, reason) =>
      setImmediate(() => {
        for (const sid of nsp.adapter.rooms.get(`c:${code}`) ?? []) {
          const s = nsp.sockets.get(sid);
          const id = (s?.data as SockData | undefined)?.identity;
          if (!s || !id || id.kind !== 'captain' || id.team !== who || service.stillValid(code, id)) continue;
          s.emit('session_ended', { reason });
          s.disconnect(true);
        }
      }),
  });

  const sendError = (res: Response, e: unknown) => {
    if (e instanceof CharadesError) {
      const status = e.code === 'no_room' ? 404 : ['seat_taken', 'name_taken', 'room_closed'].includes(e.code) ? 409 : 400;
      return res.status(status).json({ error: { code: e.code, message: e.message } });
    }
    console.error(e);
    return res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong.' } });
  };

  d.app.post('/api/charades/rooms', d.limit, (req, res) => {
    const body = CreateSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: { code: 'bad_request', message: 'Enter your name (1–24 characters).' } });
    const denied = d.checkHostCode(req.ip ?? 'unknown', body.data.hostCode);
    if (denied) return res.status(denied.status).json({ error: { code: denied.code, message: denied.message } });
    res.status(201).json(service.create(body.data.hostName));
  });

  d.app.get('/api/charades/rooms/:code', d.limit, (req, res) => {
    const code = CodeSchema.safeParse(req.params.code);
    const info = code.success ? service.publicInfo(code.data) : null;
    if (!info) return res.status(404).json({ error: { code: 'no_room', message: 'No room with that code. Check the code and try again.' } });
    res.json(info);
  });

  d.app.post('/api/charades/rooms/:code/join', d.limit, (req, res) => {
    const code = CodeSchema.safeParse(req.params.code);
    const body = JoinSchema.safeParse(req.body);
    if (!code.success || !body.success) return res.status(400).json({ error: { code: 'bad_request', message: 'Pick a team and enter your name (1–24 characters).' } });
    try {
      res.status(201).json(service.join(code.data, body.data.team as TeamIdx, body.data.name));
    } catch (e) {
      sendError(res, e);
    }
  });

  d.app.get('/api/charades/suggest', d.limit, (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 60) : '';
    res.json({ titles: service.suggest(q) });
  });

  nsp.use((socket, next) => {
    const auth = socket.handshake.auth as { code?: unknown; token?: unknown; display?: unknown };
    const code = typeof auth.code === 'string' ? auth.code.toUpperCase() : '';
    const room = service.get(code);
    if (!room || room.status === 'closed') return next(new Error('no_room'));
    if (auth.display === true) {
      socket.data = { code, identity: null } satisfies SockData;
      return next();
    }
    const identity = service.authenticate(code, typeof auth.token === 'string' ? auth.token : undefined);
    if (!identity) return next(new Error('unauthorized'));
    socket.data = { code, identity } satisfies SockData;
    next();
  });

  nsp.on('connection', (socket: Socket) => {
    const data = socket.data as SockData;
    const presenceId = data.identity?.kind === 'captain' ? data.identity.id : data.identity?.kind === 'host' ? 'host' : null;
    socket.join(`c:${data.code}`);
    if (presenceId) service.markPresence(data.code, presenceId, 1);
    broadcast(data.code);

    socket.on('cmd', (raw: unknown, ack?: (a: unknown) => void) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!d.allowSocket(socket.id)) return reply({ ok: false, error: { code: 'rate_limited', message: 'Slow down a little.' } });
      if (!data.identity) return reply({ ok: false, error: { code: 'forbidden', message: 'The TV screen is read-only.' } });
      if (!service.stillValid(data.code, data.identity)) {
        reply({ ok: false, error: { code: 'session_ended', message: 'Your session is no longer valid.' } });
        socket.emit('session_ended', { reason: 'Your session is no longer valid.' });
        return socket.disconnect(true);
      }
      reply(service.handle(data.code, data.identity, raw));
    });

    // Liveness probe from phones returning from the background: answer instantly, nothing else.
    socket.on('alive', (ack?: (ok: boolean) => void) => typeof ack === 'function' && ack(true));

    socket.on('sync', () => {
      const room = service.get(data.code);
      const viewer: CViewer = data.identity ? service.viewerOf(data.identity) : { kind: 'tv' };
      if (room) socket.emit('state', buildCView(room, viewer, service.online(data.code), Date.now()));
    });

    socket.on('disconnect', () => {
      if (presenceId) service.markPresence(data.code, presenceId, -1);
      broadcast(data.code);
    });
  });

  return service;
}
