import * as E from '../../shared/charades/engine';
import { CharadesError, type Ctx } from '../../shared/charades/engine';
import { MAX_WORDS, MIN_YEAR, normalizeTitle, wordCount } from '../../shared/charades/movie';
import { CCaptainCommandSchema, CHostCommandSchema, type Card, type CRoom, type TeamIdx } from '../../shared/charades/types';
import { hashToken, newToken, randomCode, safeEqualHex } from '../security';
import type { Store } from '../store';
import { MOVIE_BY_TITLE, MOVIES } from './movies';
import type { CViewer } from './views';
import { labels, lookupFilm, type FilmHit } from './wikidata';

export type CIdentity = { kind: 'host'; sessionVersion: number } | { kind: 'captain'; team: TeamIdx; id: string; sessionVersion: number };
export interface CAck {
  ok: boolean;
  error?: { code: string; message: string };
}

export interface CharadesServiceOptions {
  store: Store;
  rng: { int: (max: number) => number; id: () => string };
  now?: () => number;
  roomTtlMs?: number;
  onChange: (code: string) => void;
  onSessionEnded: (code: string, who: 'host' | TeamIdx, reason: string) => void;
  /** Swappable for tests. */
  lookup?: (title: string) => Promise<FilmHit | null>;
  lookupLabels?: (ids: string[]) => Promise<Record<string, string>>;
}

/**
 * Owns every Dumb Charades room. Commands run synchronously (validate → mutate →
 * persist); the only async step is checking a rival's typed movie online, which
 * re-validates the turn before applying its result.
 */
export class CharadesService {
  rooms = new Map<string, CRoom>();
  private presence = new Map<string, Map<string, number>>();
  private now: () => number;

  constructor(private opts: CharadesServiceOptions) {
    this.now = opts.now ?? Date.now;
    for (const r of opts.store.loadCharades<CRoom>()) this.rooms.set(r.code, r);
  }

  private ctx(): Ctx {
    return { now: this.now(), rng: this.opts.rng, deck: MOVIES };
  }

  get(code: string) {
    return this.rooms.get(code.toUpperCase());
  }

  private commit(room: CRoom) {
    this.opts.store.saveCharades(room.code, room, room.updatedAt);
    this.opts.onChange(room.code);
  }

  // ---------------------------------------------------------------- presence
  online(code: string): Set<string> {
    const m = this.presence.get(code);
    return new Set(m ? [...m.entries()].filter(([, c]) => c > 0).map(([id]) => id) : []);
  }
  markPresence(code: string, id: string, delta: 1 | -1) {
    const m = this.presence.get(code) ?? new Map<string, number>();
    m.set(id, Math.max(0, (m.get(id) ?? 0) + delta));
    this.presence.set(code, m);
  }

  // ---------------------------------------------------------------- sessions
  create(hostName: string) {
    let code = randomCode(5);
    while (this.rooms.has(code)) code = randomCode(5);
    const token = newToken();
    const room = E.createCRoom({ code, hostName: hostName.trim(), hostTokenHash: hashToken(token), now: this.now() });
    this.rooms.set(code, room);
    this.commit(room);
    return { code, token };
  }

  publicInfo(code: string) {
    const room = this.get(code);
    if (!room || room.status === 'closed') return null;
    return {
      code: room.code,
      status: room.status,
      hostName: room.hostName,
      teams: room.teams.map((t) => ({ name: t.name, captain: t.captain?.name ?? null })),
    };
  }

  join(code: string, team: TeamIdx, name: string) {
    const room = this.get(code);
    if (!room) throw new CharadesError('no_room', 'No room with that code. Check the code and try again.');
    const token = newToken();
    const id = this.opts.rng.id();
    E.joinCaptain(room, team, { id, name, tokenHash: hashToken(token) }, this.now());
    this.commit(room);
    return { code: room.code, token, team, name: name.trim() };
  }

  authenticate(code: string, token: string | undefined): CIdentity | null {
    const room = this.get(code);
    if (!room || room.status === 'closed' || !token) return null;
    const h = hashToken(token);
    if (safeEqualHex(room.hostTokenHash, h)) return { kind: 'host', sessionVersion: room.hostSessionVersion };
    for (const team of [0, 1] as TeamIdx[]) {
      const c = room.teams[team].captain;
      if (c && safeEqualHex(c.tokenHash, h)) return { kind: 'captain', team, id: c.id, sessionVersion: c.sessionVersion };
    }
    return null;
  }

  stillValid(code: string, id: CIdentity): boolean {
    const room = this.get(code);
    if (!room || room.status === 'closed') return false;
    if (id.kind === 'host') return true;
    const c = room.teams[id.team].captain;
    return !!c && c.id === id.id;
  }

  viewerOf(id: CIdentity): CViewer {
    return id.kind === 'host' ? { kind: 'host' } : { kind: 'captain', team: id.team };
  }

  // ---------------------------------------------------------------- commands
  handle(code: string, id: CIdentity, raw: unknown): CAck {
    const room = this.get(code);
    if (!room) return { ok: false, error: { code: 'no_room', message: 'This room no longer exists.' } };
    const actionId = typeof (raw as { actionId?: unknown })?.actionId === 'string' ? (raw as { actionId: string }).actionId.slice(0, 64) : null;
    if (actionId && room.recentActions.includes(actionId)) return { ok: true };
    try {
      const pending = this.apply(room, id, raw);
      if (actionId) room.recentActions = [...room.recentActions.slice(-49), actionId];
      this.commit(room);
      // An online movie check finishes in the background; its outcome arrives as a state update.
      if (pending) void pending;
      return { ok: true };
    } catch (e) {
      if (e instanceof CharadesError) return { ok: false, error: { code: e.code, message: e.message } };
      console.error(e);
      return { ok: false, error: { code: 'server_error', message: 'Something went wrong.' } };
    }
  }

  /** Applies a command. Returns a promise when an online movie check was started. */
  private apply(room: CRoom, id: CIdentity, raw: unknown): Promise<void> | void {
    const ctx = this.ctx();
    if (id.kind === 'host') {
      const p = CHostCommandSchema.safeParse(raw);
      if (!p.success) {
        // A host who took a captain seat also sends captain commands for that team.
        const team = E.hostTeamOf(room);
        if (team !== null && CCaptainCommandSchema.safeParse(raw).success) return this.apply(room, { kind: 'captain', team, id: E.HOST_CAPTAIN, sessionVersion: 1 }, raw);
        throw new CharadesError('bad_command', 'That command isn’t valid.');
      }
      const c = p.data;
      // Judging and pausing are guarded by the turn's stage instead: a captain's swap a
      // split second earlier must not bounce the host's ✅.
      if ('seq' in c && c.type !== 'judge' && c.type !== 'pause' && c.type !== 'resume') E.checkSeq(room, c.seq);
      switch (c.type) {
        case 'update_settings':
          return E.updateSettings(room, c.patch, ctx.now);
        case 'rename_team':
          return E.renameTeam(room, c.team, c.name, ctx.now);
        case 'start':
          return E.start(room, ctx);
        case 'claim_captain':
          return E.claimCaptain(room, c.team, ctx.now);
        case 'kick_captain':
          E.kickCaptain(room, c.team, ctx.now);
          this.opts.onSessionEnded(room.code, c.team, 'The host freed your captain seat.');
          return;
        case 'random_card':
          return E.randomForTurn(room, ctx);
        case 'reveal_here':
          if (!room.turn) throw new CharadesError('not_playing', 'The game isn’t running.');
          E.reveal(room, room.turn.team, ctx);
          room.turn.flippedByHost = true;
          return;
        case 'approve':
          return E.approve(room, c.ok, ctx.now);
        case 'judge':
          return E.judge(room, c.result, ctx.now);
        case 'pause':
          return E.pause(room, ctx.now);
        case 'resume':
          return E.resume(room, ctx.now);
        case 'fix_result':
          return E.fixResult(room, ctx.now);
        case 'next_turn':
          return E.nextTurn(room, ctx.now);
        case 'end_game':
          return E.endGame(room, ctx.now);
        case 'one_more_round':
          return E.oneMoreRound(room, ctx.now);
        case 'play_again':
          return E.playAgain(room, ctx.now);
      }
    }
    const p = CCaptainCommandSchema.safeParse(raw);
    if (!p.success) throw new CharadesError('bad_command', 'That command isn’t valid.');
    const c = p.data;
    if ('seq' in c) E.checkSeq(room, c.seq);
    switch (c.type) {
      case 'show_card':
        return E.showCard(room, id.team, c.index, ctx.now);
      case 'got_it':
        return E.captainGotIt(room, id.team, ctx.now);
      case 'reveal':
        return E.reveal(room, id.team, ctx);
      case 'swap':
        return E.swap(room, id.team, ctx);
      case 'give_up':
        return E.giveUp(room, id.team, ctx.now);
      case 'choose_movie':
        return this.chooseMovie(room, id.team, c.title, !!c.random, ctx);
    }
  }

  /** Rival captain picks the acting team's movie: random, from the deck, or anything checked online. */
  private chooseMovie(room: CRoom, team: TeamIdx, title: string | undefined, random: boolean, ctx: Ctx): Promise<void> | void {
    const t = room.turn;
    if (room.status !== 'playing' || !t || t.stage !== 'picking') throw new CharadesError('wrong_stage', 'That isn’t possible right now.');
    if (room.settings.picker !== 'rival') throw new CharadesError('wrong_mode', 'Cards come from the deck in this game.');
    if (team === t.team) throw new CharadesError('not_rival', 'The other team picks your movie.');
    if (t.checking) throw new CharadesError('busy', 'Still checking your last movie…');
    if (random || !title) return E.randomForTurn(room, ctx);

    const words = wordCount(title);
    if (words > MAX_WORDS) return E.refuseRival(room, `“${title}” has ${words} words — keep it to ${MAX_WORDS} or fewer.`, ctx.now);
    const known = MOVIE_BY_TITLE.get(normalizeTitle(title));
    if (known) {
      if (room.used.includes(known.id)) return E.refuseRival(room, `“${known.title}” has already been played tonight. Pick another.`, ctx.now);
      return E.setRivalCard(room, { ...known, source: 'rival', verified: true }, ctx.now);
    }
    E.setChecking(room, title, ctx.now);
    const n = t.n;
    const still = () => room.status === 'playing' && room.turn?.n === n && room.turn.stage === 'picking' && room.turn.checking === title;
    const lookup = this.opts.lookup ?? ((q: string) => lookupFilm(q, { timeoutMs: 6000 }));
    return lookup(title)
      .then(async (hit) => {
        if (!still()) return;
        const now = this.now();
        if (!hit) return E.askHost(room, title, 'Couldn’t find a Hindi film with that name online.', now);
        if (!hit.hindi) return E.refuseRival(room, `“${hit.label}” isn’t a Hindi film. Bollywood only!`, now);
        if (hit.year && hit.year < MIN_YEAR) return E.refuseRival(room, `“${hit.label}” came out in ${hit.year}. Pick a film from ${MIN_YEAR} or later.`, now);
        const getLabels = this.opts.lookupLabels ?? ((ids: string[]) => labels(ids, { timeoutMs: 4000 }));
        const names = await getLabels([...hit.castIds, ...hit.genreIds]).catch(() => ({}) as Record<string, string>);
        if (!still()) return;
        const display = wordCount(hit.label) <= MAX_WORDS ? hit.label : title.trim();
        const card: Card = {
          id: `wd:${hit.id}`,
          title: display,
          year: hit.year ?? 0,
          genre: hit.genreIds.map((g) => names[g]).filter(Boolean).map((g) => g.replace(/ film$/i, '')).map((g) => g[0].toUpperCase() + g.slice(1)).join(', '),
          leads: hit.castIds.map((c) => names[c]).filter(Boolean),
          tier: 2,
          source: 'web',
          verified: true,
        };
        if (room.used.includes(card.id)) return E.refuseRival(room, `“${display}” has already been played tonight. Pick another.`, this.now());
        E.setRivalCard(room, card, this.now());
      })
      .catch(() => {
        if (still()) E.askHost(room, title, 'Couldn’t check online right now.', this.now());
      })
      .finally(() => this.commit(room));
  }

  // ---------------------------------------------------------------- housekeeping
  tickAll() {
    const now = this.now();
    for (const room of this.rooms.values()) if (E.tick(room, now)) this.commit(room);
  }

  sweep() {
    const ttl = this.opts.roomTtlMs ?? 12 * 3600_000;
    const now = this.now();
    for (const room of this.rooms.values()) {
      if (now - room.updatedAt > ttl) {
        this.rooms.delete(room.code);
        this.opts.store.deleteCharades(room.code);
      }
    }
  }

  /** Up to 8 deck titles for the rival's search box (titles only — no answers to give away). */
  suggest(q: string): string[] {
    const n = normalizeTitle(q);
    if (n.length < 2) return [];
    const starts: string[] = [];
    const contains: string[] = [];
    for (const m of MOVIES) {
      const t = normalizeTitle(m.title);
      if (t.startsWith(n)) starts.push(m.title);
      else if (t.includes(n)) contains.push(m.title);
      if (starts.length >= 8) break;
    }
    return [...starts, ...contains].slice(0, 8);
  }
}
