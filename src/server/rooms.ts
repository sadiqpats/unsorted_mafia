import * as E from '../shared/engine';
import { GameError, type Rng } from '../shared/engine';
import { HOST_COMMANDS, HostCommandSchema, PLAYER_COMMANDS, PlayerCommandSchema, type Ack } from '../shared/protocol';
import type { Room } from '../shared/types';
import { hashToken, newToken, randomCode, safeEqualHex } from './security';
import type { Store } from './store';
import type { Viewer } from './views';

export interface Identity {
  viewer: Viewer;
  /** Player id acting in-game (players, or a host who also plays). */
  playerId: string | null;
  isHost: boolean;
  sessionVersion: number;
}

export interface RoomServiceOptions {
  store: Store;
  rng: Rng;
  now?: () => number;
  roomTtlMs?: number;
  onChange: (code: string) => void;
  onSessionEnded: (code: string, playerId: string | 'all' | 'host', reason: string) => void;
}

/**
 * Owns all rooms. Node runs JavaScript on a single thread and every command is
 * applied synchronously (validate → mutate → persist), so two commands for the
 * same room can never interleave — that is our transaction/lock. Duplicate
 * commands are rejected by idempotency key, stale ones by phaseSeq.
 */
export class RoomService {
  rooms = new Map<string, Room>();
  /** roomCode -> playerId -> live socket count */
  private presence = new Map<string, Map<string, number>>();
  private now: () => number;

  constructor(private opts: RoomServiceOptions) {
    this.now = opts.now ?? Date.now;
    for (const room of opts.store.loadAll()) this.rooms.set(room.code, room);
  }

  // ------------------------------------------------------------ presence
  connected(code: string): Set<string> {
    const m = this.presence.get(code);
    return new Set(m ? [...m.entries()].filter(([, c]) => c > 0).map(([id]) => id) : []);
  }

  markPresence(code: string, presenceId: string, delta: 1 | -1) {
    const m = this.presence.get(code) ?? new Map<string, number>();
    m.set(presenceId, Math.max(0, (m.get(presenceId) ?? 0) + delta));
    this.presence.set(code, m);
  }

  // ------------------------------------------------------------ lookups
  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  publicInfo(code: string) {
    const room = this.get(code);
    if (!room || room.status === 'closed') return null;
    const s = room.game?.settings ?? room.settings;
    let joinable = room.status === 'lobby' && room.players.length < room.settings.playerCount;
    let reason: string | null = null;
    if (room.status === 'lobby' && !joinable) reason = 'This room is full.';
    if (room.status === 'active') {
      joinable = s.allowLateJoin;
      reason = joinable ? null : 'This game is already in progress.';
    }
    if (room.status === 'over') reason = 'This game has finished. Ask the host to start a new round.';
    return { code: room.code, status: room.status, hostName: room.hostName, players: room.players.length, capacity: room.settings.playerCount, joinable, reason };
  }

  // ------------------------------------------------------------ sessions
  createRoom(input: { hostName: string; hostPlays?: boolean; playerCount?: number }) {
    let code = randomCode(5);
    while (this.rooms.has(code)) code = randomCode(5);
    const token = newToken();
    const room = E.createRoom({
      code,
      hostName: input.hostName,
      hostTokenHash: hashToken(token),
      hostPlays: !!input.hostPlays,
      now: this.now(),
      playerCount: input.playerCount,
      hostPlayerId: this.opts.rng.id(),
    });
    this.commit(room, 'host', 'create_room', true);
    return { code, token, playerId: room.hostPlayerId };
  }

  join(code: string, name: string) {
    const room = this.requireRoom(code);
    const token = newToken();
    const p = E.addPlayer(room, { id: this.opts.rng.id(), name, tokenHash: hashToken(token), now: this.now() });
    this.commit(room, p.id, 'join', true, p.name);
    return { token, playerId: p.id };
  }

  /** A host-issued one-time code moves a seat to a new device and logs the old one out. */
  rejoin(code: string, rejoinCode: string) {
    const room = this.requireRoom(code);
    const h = hashToken(rejoinCode.trim().toUpperCase());
    const p = room.players.find((x) => x.rejoinCodeHash && safeEqualHex(x.rejoinCodeHash, h));
    if (!p) throw new GameError('bad_code', 'That rejoin code is not valid. Ask the host for a new one.');
    const token = newToken();
    p.tokenHash = hashToken(token);
    p.rejoinCodeHash = null;
    p.sessionVersion++;
    this.commit(room, p.id, 'rejoin', true, p.name);
    this.opts.onSessionEnded(room.code, p.id, 'This seat was moved to another device.');
    return { token, playerId: p.id };
  }

  /**
   * Set (or clear, with null) the caller's own photo. Only JPEG/PNG/WebP data URLs
   * up to MAX_PHOTO_BYTES are accepted; the magic bytes must match the declared type.
   */
  setPhoto(code: string, token: string | undefined, dataUrl: string | null) {
    const room = this.requireRoom(code);
    const id = this.authenticate(code, token);
    const playerId = id ? (id.isHost ? room.hostPlayerId : id.playerId) : null;
    if (!playerId) throw new GameError('forbidden', 'Join the room first.');
    const p = E.getPlayer(room, playerId);
    if (dataUrl === null) {
      p.photoVersion = null;
      this.opts.store.deletePhoto(room.code, p.id);
    } else {
      const { mime, data } = parsePhoto(dataUrl);
      this.opts.store.setPhoto(room.code, p.id, mime, data);
      p.photoVersion = (p.photoVersion ?? 0) + 1;
    }
    this.commit(room, p.id, dataUrl ? 'set_photo' : 'clear_photo', true);
    return { photo: p.photoVersion ? `/api/rooms/${room.code}/photos/${p.id}?v=${p.photoVersion}` : null };
  }

  getPhoto(code: string, playerId: string) {
    const room = this.get(code);
    if (!room || room.status === 'closed') return undefined;
    const p = room.players.find((x) => x.id === playerId);
    if (!p?.photoVersion) return undefined;
    return this.opts.store.getPhoto(room.code, p.id);
  }

  authenticate(code: string, token: string | undefined): Identity | null {
    const room = this.get(code);
    if (!room || room.status === 'closed' || !token) return null;
    const h = hashToken(token);
    if (safeEqualHex(room.hostTokenHash, h)) {
      return { viewer: { kind: 'host' }, playerId: room.hostPlayerId, isHost: true, sessionVersion: 0 };
    }
    const p = room.players.find((x) => !x.isHost && safeEqualHex(x.tokenHash, h));
    if (!p) return null;
    return { viewer: { kind: 'player', playerId: p.id }, playerId: p.id, isHost: false, sessionVersion: p.sessionVersion };
  }

  /** Re-check on every command so kicked/revoked sessions can no longer act. */
  stillValid(code: string, id: Identity, tokenHash: string): boolean {
    const room = this.get(code);
    if (!room || room.status === 'closed') return false;
    if (id.isHost) return safeEqualHex(room.hostTokenHash, tokenHash);
    const p = room.players.find((x) => x.id === id.playerId);
    return !!p && p.sessionVersion === id.sessionVersion && safeEqualHex(p.tokenHash, tokenHash);
  }

  // ------------------------------------------------------------ commands
  handle(code: string, id: Identity, raw: unknown): Ack {
    const room = this.get(code);
    if (!room) return err('no_room', 'Room not found.');
    const type = (raw as { type?: unknown })?.type;
    const actor = id.isHost ? 'host' : id.playerId!;
    if (typeof type !== 'string' || (!PLAYER_COMMANDS.has(type as never) && !HOST_COMMANDS.has(type as never))) {
      return err('bad_request', 'Unknown command.');
    }
    const isHostCmd = HOST_COMMANDS.has(type as never);
    if (isHostCmd && !id.isHost) {
      this.opts.store.audit(room.code, this.now(), actor, type, false, 'forbidden');
      return err('forbidden', 'Only the host can do that.');
    }
    const parsed = isHostCmd ? HostCommandSchema.safeParse(raw) : PlayerCommandSchema.safeParse(raw);
    if (!parsed.success) return err('bad_request', 'Malformed request.');
    const cmd = parsed.data;

    const recent = room.recentActionIds[actor] ?? [];
    if (recent.includes(cmd.actionId)) return { ok: true, duplicate: true };

    const now = this.now();
    let data: Record<string, unknown> | undefined;
    // Transaction: work on the live object, roll back to this snapshot if anything throws.
    const snapshot = structuredClone(room);
    try {
      const seatId = id.isHost ? room.hostPlayerId : id.playerId;
      if (!isHostCmd && !seatId) throw new GameError('forbidden', 'You are not seated in this game.');
      const pid = seatId!;
      switch (cmd.type) {
        case 'ready':
          E.setReady(room, pid, cmd.ready);
          break;
        case 'ack_role':
          E.acknowledgeRole(room, pid);
          break;
        case 'night_action':
          E.submitNightAction(room, pid, cmd, now);
          break;
        case 'vote':
          E.submitVote(room, pid, cmd, now);
          break;
        case 'update_settings':
          E.updateSettings(room, cmd.patch);
          break;
        case 'set_host_plays':
          E.setHostPlays(room, cmd.hostPlays, now, this.opts.rng.id());
          break;
        case 'kick': {
          E.removePlayer(room, cmd.playerId, now);
          this.opts.store.deletePhoto(room.code, cmd.playerId);
          this.opts.onSessionEnded(room.code, cmd.playerId, 'The host removed you from this room.');
          break;
        }
        case 'start':
          E.startGame(room, now, this.opts.rng, { force: cmd.force });
          break;
        case 'advance':
          if (!room.game || cmd.phaseSeq !== room.game.phaseSeq) throw new GameError('phase_closed', 'The phase already changed.');
          E.advancePhase(room, now, this.opts.rng, 'host');
          break;
        case 'pause':
          E.pauseGame(room, now);
          break;
        case 'resume':
          E.resumeGame(room, now);
          break;
        case 'extend':
          E.extendTimer(room, cmd.seconds, now);
          break;
        case 'eliminate':
          E.hostEliminate(room, cmd.playerId, now);
          break;
        case 'restore':
          E.hostRestore(room, cmd.playerId, now);
          break;
        case 'resolve_tie':
          E.resolveTie(room, cmd.targetId, now);
          break;
        case 'end_game':
          E.hostEndGame(room, now);
          break;
        case 'restart':
          E.resetToLobby(room, now);
          break;
        case 'announce':
          E.hostAnnounce(room, cmd.text, now);
          break;
        case 'close_room':
          E.closeRoom(room, now);
          this.opts.onSessionEnded(room.code, 'all', 'The host closed this room.');
          break;
        case 'remove_photo': {
          const p = E.getPlayer(room, cmd.playerId);
          p.photoVersion = null;
          this.opts.store.deletePhoto(room.code, p.id);
          E.addLog(room, now, 'host', `Host removed ${p.name}'s photo.`, 'host');
          break;
        }
        case 'issue_rejoin': {
          const p = E.getPlayer(room, cmd.playerId);
          const rejoinCode = randomCode(6);
          p.rejoinCodeHash = hashToken(rejoinCode);
          E.addLog(room, now, 'host', `Rejoin code issued for ${p.name}.`, 'host');
          data = { rejoinCode };
          break;
        }
      }
      E.tick(room, now, this.opts.rng); // e.g. last night action submitted → resolve immediately
    } catch (e) {
      this.rooms.set(room.code, snapshot);
      if (e instanceof GameError) {
        this.opts.store.audit(room.code, now, actor, cmd.type, false, e.code);
        return err(e.code, e.message);
      }
      console.error('Unexpected error handling command', cmd.type, e);
      return err('server_error', 'Something went wrong on the server.');
    }
    room.recentActionIds[actor] = [...recent, cmd.actionId].slice(-50);
    this.commit(room, actor, cmd.type, true, summarize(cmd));
    return { ok: true, data };
  }

  // ------------------------------------------------------------ loop
  tickAll() {
    const now = this.now();
    for (const room of this.rooms.values()) {
      if (room.status !== 'active') continue;
      try {
        if (E.tick(room, now, this.opts.rng)) this.commit(room, 'server', 'tick', true, room.game?.phase);
      } catch (e) {
        console.error('tick failed for', room.code, e);
      }
    }
  }

  /** Inactivity policy: rooms idle longer than the TTL (default 12h) are deleted. */
  sweep() {
    const now = this.now();
    const ttl = this.opts.roomTtlMs ?? 12 * 3600_000;
    for (const room of [...this.rooms.values()]) {
      const idle = now - room.updatedAt;
      if (idle > ttl || (room.status === 'closed' && idle > 3600_000)) {
        this.rooms.delete(room.code);
        this.presence.delete(room.code);
        this.opts.store.delete(room.code);
      }
    }
  }

  private requireRoom(code: string): Room {
    const room = this.get(code);
    if (!room || room.status === 'closed') throw new GameError('no_room', 'That room does not exist or has been closed.');
    return room;
  }

  private commit(room: Room, actor: string, action: string, ok: boolean, detail?: string) {
    room.updatedAt = this.now();
    this.rooms.set(room.code, room);
    this.opts.store.save(room);
    this.opts.store.audit(room.code, room.updatedAt, actor, action, ok, detail);
    this.opts.onChange(room.code);
  }
}

export const MAX_PHOTO_BYTES = 150_000;
const PHOTO_TYPES: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
};

export function parsePhoto(dataUrl: string): { mime: string; data: Buffer } {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new GameError('bad_photo', 'Photos must be a JPEG, PNG or WebP image.');
  const data = Buffer.from(m[2], 'base64');
  if (data.length > MAX_PHOTO_BYTES) throw new GameError('bad_photo', 'That photo is too large.');
  if (!PHOTO_TYPES[m[1]](data)) throw new GameError('bad_photo', 'That file is not a valid image.');
  return { mime: m[1], data };
}

function err(code: string, message: string): Ack {
  return { ok: false, error: { code, message } };
}

/** Audit detail without secrets that would matter (targets are fine: audit is server-side only). */
function summarize(cmd: { type: string } & Record<string, unknown>): string {
  const { actionId: _a, type: _t, ...rest } = cmd;
  return JSON.stringify(rest).slice(0, 300);
}
