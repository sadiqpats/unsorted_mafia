import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { resolveClientOrigins } from './config';

/**
 * Production / dev entry point. Configuration comes only from environment
 * variables (see .env.example). There are no secrets to configure: player and
 * host sessions are random tokens generated per room.
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

const port = Number(process.env.PORT ?? 3001);
const dbPath = process.env.DATABASE_PATH ?? join(root, 'data', 'mafia.db');
const staticDir = process.env.STATIC_DIR ?? join(root, 'dist', 'client');
const corsOrigin = resolveClientOrigins(process.env.CLIENT_ORIGIN);

// Optional. When HOST_CODE is set (Render → Environment; never commit it — the repo is public),
// hosting requires it. When it is not set, anyone can host and the Host page hides the code box.
const hostCode = process.env.HOST_CODE?.trim() || undefined;
console.log(hostCode ? '🔒 Hosting requires HOST_CODE.' : '🔓 HOST_CODE not set — anyone can host.');

const server = createApp({
  hostCode,
  dbPath,
  staticDir,
  corsOrigin,
  trustProxy: process.env.TRUST_PROXY === 'true',
  roomTtlHours: Number(process.env.ROOM_TTL_HOURS ?? 12),
  httpBurst: process.env.HTTP_RATE_BURST ? Number(process.env.HTTP_RATE_BURST) : undefined,
  httpPerSec: process.env.HTTP_RATE_PER_SEC ? Number(process.env.HTTP_RATE_PER_SEC) : undefined,
});

server.listen(port, process.env.HOST ?? '0.0.0.0').then((p) => {
  console.log(`🎩 Mafia Night server listening on http://localhost:${p}  (db: ${dbPath})`);
});

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
