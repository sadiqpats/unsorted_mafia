import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Room } from '../shared/types';

/**
 * SQLite persistence (Node's built-in node:sqlite — no native build step).
 * The authoritative state for each room is a JSON document written synchronously
 * after every accepted command, so a browser refresh or a server restart resumes
 * exactly where the game was. Every command is also written to an append-only
 * audit log.
 */
export class Store {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        state TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_code TEXT NOT NULL,
        at INTEGER NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        ok INTEGER NOT NULL,
        detail TEXT
      );
      CREATE INDEX IF NOT EXISTS audit_room ON audit_log(room_code, at);
      CREATE TABLE IF NOT EXISTS photos (
        room_code TEXT NOT NULL,
        player_id TEXT NOT NULL,
        mime TEXT NOT NULL,
        data BLOB NOT NULL,
        PRIMARY KEY (room_code, player_id)
      );
    `);
  }

  loadAll(): Room[] {
    const rows = this.db.prepare('SELECT state FROM rooms').all() as { state: string }[];
    return rows.map((r) => JSON.parse(r.state) as Room);
  }

  save(room: Room) {
    this.db
      .prepare(
        'INSERT INTO rooms (code, status, state, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(code) DO UPDATE SET status = excluded.status, state = excluded.state, updated_at = excluded.updated_at',
      )
      .run(room.code, room.status, JSON.stringify(room), room.updatedAt);
  }

  delete(code: string) {
    this.db.prepare('DELETE FROM rooms WHERE code = ?').run(code);
    this.db.prepare('DELETE FROM audit_log WHERE room_code = ?').run(code);
    this.db.prepare('DELETE FROM photos WHERE room_code = ?').run(code);
  }

  setPhoto(code: string, playerId: string, mime: string, data: Buffer) {
    this.db
      .prepare('INSERT INTO photos (room_code, player_id, mime, data) VALUES (?, ?, ?, ?) ON CONFLICT(room_code, player_id) DO UPDATE SET mime = excluded.mime, data = excluded.data')
      .run(code, playerId, mime, data);
  }

  getPhoto(code: string, playerId: string): { mime: string; data: Uint8Array } | undefined {
    return this.db.prepare('SELECT mime, data FROM photos WHERE room_code = ? AND player_id = ?').get(code, playerId) as never;
  }

  deletePhoto(code: string, playerId: string) {
    this.db.prepare('DELETE FROM photos WHERE room_code = ? AND player_id = ?').run(code, playerId);
  }

  audit(code: string, at: number, actor: string, action: string, ok: boolean, detail?: string) {
    this.db.prepare('INSERT INTO audit_log (room_code, at, actor, action, ok, detail) VALUES (?, ?, ?, ?, ?, ?)').run(code, at, actor, action, ok ? 1 : 0, detail ?? null);
  }

  auditFor(code: string): { at: number; actor: string; action: string; ok: number; detail: string | null }[] {
    return this.db.prepare('SELECT at, actor, action, ok, detail FROM audit_log WHERE room_code = ? ORDER BY id').all(code) as never;
  }

  close() {
    this.db.close();
  }
}
