import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import { join } from 'node:path';
import { Server as IOServer, type Socket } from 'socket.io';
import { z } from 'zod';
import { GameError } from '../shared/engine';
import { MAX_PLAYERS, MIN_PLAYERS } from '../shared/settings';
import { RoomService, type Identity } from './rooms';
import { RateLimiter, hashToken, secureRng } from './security';
import { Store } from './store';
import { buildView } from './views';

export interface AppOptions {
  dbPath: string;
  staticDir?: string;
  corsOrigin?: string | string[];
  trustProxy?: boolean;
  tickMs?: number;
  roomTtlHours?: number;
  httpBurst?: number;
  httpPerSec?: number;
}

interface SocketData {
  code: string;
  identity: Identity;
  tokenHash: string;
  presenceId: string | null;
}

const NameSchema = z.string().min(1).max(40);
const CreateSchema = z.object({
  hostName: NameSchema,
  hostPlays: z.boolean().optional(),
  playerCount: z.number().int().min(MIN_PLAYERS).max(MAX_PLAYERS).optional(),
});
const JoinSchema = z.object({ name: NameSchema });
const RejoinSchema = z.object({ rejoinCode: z.string().min(4).max(12) });
const CodeSchema = z.string().regex(/^[A-Za-z0-9]{4,8}$/);
const PhotoSchema = z.object({ photo: z.string().max(220_000).nullable() });

export function createApp(opts: AppOptions) {
  const store = new Store(opts.dbPath);
  const app = express();
  const http: HttpServer = createServer(app);
  const io = new IOServer(http, {
    cors: opts.corsOrigin ? { origin: opts.corsOrigin } : undefined,
    maxHttpBufferSize: 32_000,
    // Phones throttle or pause pages when the screen locks or the player switches apps.
    // Be patient before declaring a phone gone (25s between pings, 45s grace).
    pingInterval: 25_000,
    pingTimeout: 45_000,
  });

  // -------------------------------------------------------------- realtime fan-out
  const broadcast = (code: string) => {
    const room = service.get(code);
    if (!room) return;
    const connected = service.connected(code);
    const now = Date.now();
    for (const sid of io.sockets.adapter.rooms.get(`room:${code}`) ?? []) {
      const s = io.sockets.sockets.get(sid);
      if (!s) continue;
      const data = s.data as SocketData;
      s.emit('state', buildView(room, data.identity.viewer, connected, now));
    }
  };

  const endSessions = (code: string, who: string, reason: string) => {
    for (const sid of io.sockets.adapter.rooms.get(`room:${code}`) ?? []) {
      const s = io.sockets.sockets.get(sid);
      if (!s) continue;
      const d = s.data as SocketData;
      const isPlayer = d.identity.viewer.kind === 'player';
      const match = who === 'all' || (isPlayer && d.identity.playerId === who);
      if (!match) continue;
      // A rejoin moves a seat: keep the new device's socket (matching token) connected.
      if (who !== 'all' && service.stillValid(code, d.identity, d.tokenHash)) continue;
      s.emit('session_ended', { reason });
      s.disconnect(true);
    }
  };

  const service = new RoomService({
    store,
    rng: secureRng,
    roomTtlMs: (opts.roomTtlHours ?? 12) * 3600_000,
    onChange: (code) => broadcast(code),
    onSessionEnded: (code, who, reason) => setImmediate(() => endSessions(code, who, reason)),
  });

  // -------------------------------------------------------------- HTTP
  if (opts.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  // CORS — only needed when the website is hosted elsewhere (e.g. Vercel) and CLIENT_ORIGIN lists it.
  const allowed = new Set([opts.corsOrigin ?? []].flat());
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
      res.setHeader('Access-Control-Max-Age', '600');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      if (req.method === 'OPTIONS') return res.status(204).end();
    }
    next();
  });
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; frame-ancestors 'none'",
    );
    next();
  });
  // Photo upload needs a bigger body than every other route, so it is registered before the 8 KB parser.
  app.post('/api/rooms/:code/photo', express.json({ limit: '250kb' }), (req, res, next) => limit(req, res, next), (req, res) => {
    const code = CodeSchema.safeParse(req.params.code);
    const body = PhotoSchema.safeParse(req.body);
    if (!code.success || !body.success) return res.status(400).json({ error: { code: 'bad_request', message: 'Invalid photo upload.' } });
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    try {
      res.json(service.setPhoto(code.data, token, body.data.photo));
    } catch (e) {
      if (e instanceof GameError && e.code === 'forbidden') return res.status(401).json({ error: { code: e.code, message: e.message } });
      sendError(res, e);
    }
  });
  app.use(express.json({ limit: '8kb' }));

  // Generous per-IP limit: at a venue, every guest's phone can share one public IP (NAT).
  const httpLimiter = new RateLimiter(opts.httpBurst ?? 150, opts.httpPerSec ?? 3);
  const limit = (req: Request, res: Response, next: NextFunction) => {
    if (!httpLimiter.take(req.ip ?? 'unknown')) return res.status(429).json({ error: { code: 'rate_limited', message: 'Too many requests — slow down a little.' } });
    next();
  };
  const sendError = (res: Response, e: unknown) => {
    if (e instanceof GameError) {
      const status = e.code === 'no_room' ? 404 : ['room_full', 'in_progress', 'name_taken', 'room_closed'].includes(e.code) ? 409 : 400;
      return res.status(status).json({ error: { code: e.code, message: e.message } });
    }
    console.error(e);
    return res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong.' } });
  };

  const startedAt = new Date().toISOString();
  app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: service.rooms.size, startedAt }));

  app.post('/api/rooms', limit, (req, res) => {
    const body = CreateSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: { code: 'bad_request', message: 'Enter a display name (1–20 characters).' } });
    try {
      res.status(201).json(service.createRoom(body.data));
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get('/api/rooms/:code', limit, (req, res) => {
    const code = CodeSchema.safeParse(req.params.code);
    const info = code.success ? service.publicInfo(code.data) : null;
    if (!info) return res.status(404).json({ error: { code: 'no_room', message: 'No room with that code. Check the code and try again.' } });
    res.json(info);
  });

  app.post('/api/rooms/:code/join', limit, (req, res) => {
    const code = CodeSchema.safeParse(req.params.code);
    const body = JoinSchema.safeParse(req.body);
    if (!code.success || !body.success) return res.status(400).json({ error: { code: 'bad_request', message: 'Enter a display name (1–20 characters).' } });
    try {
      res.status(201).json(service.join(code.data, body.data.name));
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post('/api/rooms/:code/rejoin', limit, (req, res) => {
    const code = CodeSchema.safeParse(req.params.code);
    const body = RejoinSchema.safeParse(req.body);
    if (!code.success || !body.success) return res.status(400).json({ error: { code: 'bad_request', message: 'Enter the rejoin code from the host.' } });
    try {
      res.json(service.rejoin(code.data, body.data.rejoinCode));
    } catch (e) {
      sendError(res, e);
    }
  });

  app.get('/api/rooms/:code/photos/:playerId', (req, res) => {
    const photo = service.getPhoto(String(req.params.code), String(req.params.playerId));
    if (!photo) return res.status(404).end();
    res.setHeader('Content-Type', photo.mime);
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    res.send(Buffer.from(photo.data));
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Not found' } }));

  if (opts.staticDir && existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(join(opts.staticDir!, 'index.html')));
  }

  // -------------------------------------------------------------- sockets
  const socketLimiter = new RateLimiter(25, 4);

  io.use((socket, next) => {
    const auth = socket.handshake.auth as { code?: unknown; token?: unknown; display?: unknown };
    const code = typeof auth.code === 'string' ? auth.code.toUpperCase() : '';
    const room = service.get(code);
    if (!room || room.status === 'closed') return next(new Error('no_room'));
    if (auth.display === true) {
      socket.data = { code, identity: { viewer: { kind: 'public' }, playerId: null, isHost: false, sessionVersion: 0 }, tokenHash: '', presenceId: null } satisfies SocketData;
      return next();
    }
    const token = typeof auth.token === 'string' ? auth.token : undefined;
    const identity = service.authenticate(code, token);
    if (!identity) return next(new Error('unauthorized'));
    socket.data = { code, identity, tokenHash: hashToken(token!), presenceId: identity.isHost ? (room.hostPlayerId ?? 'host') : identity.playerId } satisfies SocketData;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const data = socket.data as SocketData;
    socket.join(`room:${data.code}`);
    if (data.presenceId) service.markPresence(data.code, data.presenceId, 1);
    broadcast(data.code);

    socket.on('cmd', (raw: unknown, ack?: (a: unknown) => void) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!socketLimiter.take(socket.id)) return reply({ ok: false, error: { code: 'rate_limited', message: 'Slow down a little.' } });
      if (data.identity.viewer.kind === 'public') return reply({ ok: false, error: { code: 'forbidden', message: 'Display screens are read-only.' } });
      if (!service.stillValid(data.code, data.identity, data.tokenHash)) {
        reply({ ok: false, error: { code: 'session_ended', message: 'Your session is no longer valid.' } });
        socket.emit('session_ended', { reason: 'Your session is no longer valid.' });
        return socket.disconnect(true);
      }
      reply(service.handle(data.code, data.identity, raw));
    });

    socket.on('sync', () => {
      const room = service.get(data.code);
      if (room) socket.emit('state', buildView(room, data.identity.viewer, service.connected(data.code), Date.now()));
    });

    socket.on('disconnect', () => {
      if (data.presenceId) service.markPresence(data.code, data.presenceId, -1);
      broadcast(data.code);
    });
  });

  const tickTimer = setInterval(() => service.tickAll(), opts.tickMs ?? 250);
  const sweepTimer = setInterval(() => service.sweep(), 10 * 60_000);

  return {
    app,
    http,
    io,
    service,
    store,
    listen(port: number, host = '0.0.0.0') {
      return new Promise<number>((resolve) => {
        http.listen(port, host, () => {
          const addr = http.address();
          resolve(typeof addr === 'object' && addr ? addr.port : port);
        });
      });
    },
    async close() {
      clearInterval(tickTimer);
      clearInterval(sweepTimer);
      await new Promise<void>((r) => io.close(() => r()));
      store.close();
    },
  };
}
