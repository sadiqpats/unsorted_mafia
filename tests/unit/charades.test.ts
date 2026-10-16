import { describe, expect, it } from 'vitest';
import * as E from '../../src/shared/charades/engine';
import { MOVIE_COUNTS } from '../../src/shared/charades/counts';
import { normalizeTitle, wordCount } from '../../src/shared/charades/movie';
import type { CRoom, TeamIdx } from '../../src/shared/charades/types';
import { MOVIES } from '../../src/server/charades/movies';
import { CharadesService } from '../../src/server/charades/service';
import { buildCView } from '../../src/server/charades/views';
import { Store } from '../../src/server/store';

let clock = 1_000_000;
const ctx = (seed = 0): E.Ctx => ({ now: clock, rng: { int: (m) => (seed++ * 7919) % m }, deck: MOVIES });

function lobby(): CRoom {
  const r = E.createCRoom({ code: 'ABCDE', hostName: 'Host', hostTokenHash: 'h', now: clock });
  E.joinCaptain(r, 0, { id: 'c0', name: 'Asha', tokenHash: 'a' }, clock);
  E.joinCaptain(r, 1, { id: 'c1', name: 'Ravi', tokenHash: 'b' }, clock);
  return r;
}
function started(patch: Partial<CRoom['settings']> = {}) {
  const r = lobby();
  E.updateSettings(r, { firstTeam: '0', ...patch }, clock);
  E.start(r, ctx());
  return r;
}
const view = (r: CRoom, v: Parameters<typeof buildCView>[1]) => buildCView(r, v, new Set(), clock);

describe('the deck', () => {
  it('has nearly 1,000 famous Hindi films from 2000 on, each at most four words, no repeats', () => {
    expect(MOVIES.length).toBeGreaterThanOrEqual(950);
    const seen = new Set<string>();
    for (const m of MOVIES) {
      expect(m.year, m.title).toBeGreaterThanOrEqual(2000);
      expect(wordCount(m.title), m.title).toBeLessThanOrEqual(4);
      expect(m.genre, m.title).not.toBe('');
      expect(m.leads.length, m.title).toBeGreaterThan(0);
      expect(seen.has(normalizeTitle(m.title)), m.title).toBe(false);
      seen.add(normalizeTitle(m.title));
    }
    expect(MOVIES.filter((m) => m.tier === 1).length).toBeGreaterThan(150);
  });

  it('the difficulty counts shown to the host match the deck', () => {
    expect(MOVIE_COUNTS).toEqual({ easy: MOVIES.filter((m) => m.tier === 1).length, mixed: MOVIES.filter((m) => m.tier <= 2).length, all: MOVIES.length });
  });

  it('counts words the way an actor would', () => {
    expect(wordCount('Munna Bhai M.B.B.S.')).toBe(3);
    expect(wordCount('Kabhi Khushi Kabhie Gham')).toBe(4);
    expect(wordCount('Life in a... Metro')).toBe(4);
    expect(wordCount('Rab Ne Bana Di Jodi')).toBe(5);
  });
});

describe('a game', () => {
  it('needs both captains; teams alternate; a round is one turn each; correct = +1 point', () => {
    const r = lobby();
    r.teams[1].captain = null;
    expect(() => E.start(r, ctx())).toThrow(/captains/);
    const g = started({ rounds: 2 });
    expect(g.turn).toMatchObject({ n: 1, round: 1, team: 0, stage: 'picking' });
    E.reveal(g, 0, ctx());
    expect(g.turn!.stage).toBe('acting');
    expect(g.turn!.endsAt).toBe(clock + 120_000);
    E.judge(g, 'correct', clock + 30_000);
    expect(g.teams[0].score).toBe(1);
    expect(g.turn).toMatchObject({ stage: 'done', result: 'correct', tookMs: 30_000 });
    E.nextTurn(g, clock);
    expect(g.turn).toMatchObject({ n: 2, round: 1, team: 1 });
    E.reveal(g, 1, ctx(1));
    E.giveUp(g, 1, clock);
    expect(g.teams[1].score).toBe(0);
    E.nextTurn(g, clock);
    expect(g.turn).toMatchObject({ n: 3, round: 2, team: 0 });
    E.reveal(g, 0, ctx(2));
    expect(E.tick(g, clock + 119_000)).toBe(false);
    expect(E.tick(g, clock + 120_000)).toBe(true);
    expect(g.turn!.result).toBe('timeout');
    E.nextTurn(g, clock);
    E.reveal(g, 1, ctx(3));
    E.judge(g, 'correct', clock);
    E.nextTurn(g, clock);
    expect(g.status).toBe('over');
    expect(E.winnerOf(g)).toBe('tie');
    E.oneMoreRound(g, clock);
    expect(g.status).toBe('playing');
    expect(g.turn).toMatchObject({ n: 5, round: 3, team: 0 });
    expect(g.history.map((h) => h.result)).toEqual(['correct', 'pass', 'timeout', 'correct']);
  });

  it('“one more round” after ending early finishes the cut-short round, then plays one more', () => {
    const g = started({ rounds: 5 });
    E.reveal(g, 0, ctx());
    E.judge(g, 'correct', clock);
    E.nextTurn(g, clock);
    E.reveal(g, 1, ctx(1));
    E.judge(g, 'pass', clock);
    E.nextTurn(g, clock); // turn 3 (round 2, team 0) is picking
    E.endGame(g, clock);
    E.oneMoreRound(g, clock);
    // Turn 3 never happened: restart it; play out round 2 only.
    expect(g.turn).toMatchObject({ n: 3, round: 2, team: 0, stage: 'picking' });
    expect(g.settings.rounds).toBe(2);

    const h = started({ rounds: 5 });
    E.reveal(h, 0, ctx());
    E.judge(h, 'correct', clock);
    E.endGame(h, clock); // team 1 never acted in round 1
    E.oneMoreRound(h, clock);
    expect(h.turn).toMatchObject({ n: 2, round: 1, team: 1 });
    expect(h.settings.rounds).toBe(2); // finish round 1, then one more
  });

  it('only the acting captain can flip, swap or give up', () => {
    const g = started();
    expect(() => E.reveal(g, 1, ctx())).toThrow(/other team/);
    E.reveal(g, 0, ctx());
    expect(() => E.swap(g, 1, ctx())).toThrow(/other team/);
    expect(() => E.giveUp(g, 1, clock)).toThrow(/other team/);
  });

  it('swaps are limited per turn, deal a fresh card and keep the clock running', () => {
    const g = started({ swaps: 1 });
    E.reveal(g, 0, ctx());
    const first = g.turn!.card!.title;
    const ends = g.turn!.endsAt;
    E.swap(g, 0, ctx(5));
    expect(g.turn!.card!.title).not.toBe(first);
    expect(g.turn!.endsAt).toBe(ends);
    expect(() => E.swap(g, 0, ctx(6))).toThrow(/No swaps/);
  });

  it('never deals the same movie twice in a session, and respects difficulty', () => {
    const g = started({ difficulty: 'easy' });
    const seen = new Set<string>();
    for (let i = 0; i < 150; i++) {
      const c = E.drawCard(g, ctx(i));
      expect(c.tier).toBe(1);
      expect(seen.has(c.id)).toBe(false);
      seen.add(c.id);
    }
  });

  it('pause freezes the clock; resume gives back the same time', () => {
    const g = started();
    E.reveal(g, 0, ctx());
    E.pause(g, clock + 10_000);
    expect(E.tick(g, clock + 500_000)).toBe(false);
    E.resume(g, clock + 60_000);
    expect(g.turn!.endsAt).toBe(clock + 60_000 + 110_000);
  });

  it('the host can fix a wrong call after the turn', () => {
    const g = started();
    E.reveal(g, 0, ctx());
    E.judge(g, 'pass', clock);
    E.fixResult(g, clock);
    expect(g.teams[0].score).toBe(1);
    expect(g.history[0].result).toBe('correct');
    E.fixResult(g, clock);
    expect(g.teams[0].score).toBe(0);
  });

  it('stale taps are refused', () => {
    const g = started();
    const old = g.seq;
    E.reveal(g, 0, ctx());
    expect(() => E.checkSeq(g, old)).toThrow(/moved on/);
  });
});

describe('who sees the movie', () => {
  it('deck mode: host and the acting captain only, everyone once the turn is over', () => {
    const g = started();
    E.reveal(g, 0, ctx());
    expect(view(g, { kind: 'host' }).turn!.card).not.toBeNull();
    expect(view(g, { kind: 'captain', team: 0 }).turn!.card).not.toBeNull();
    expect(view(g, { kind: 'captain', team: 1 }).turn!.card).toBeNull();
    expect(view(g, { kind: 'tv' }).turn!.card).toBeNull();
    expect(view(g, { kind: 'tv' }).turn!.words).toBe(wordCount(g.turn!.card!.title));
    E.judge(g, 'correct', clock);
    expect(view(g, { kind: 'tv' }).turn!.card!.title).toBe(g.turn!.card!.title);
  });

  it('rival mode: the acting captain sees it only after flipping; the rival who picked it sees it', () => {
    const g = started({ picker: 'rival' });
    E.setRivalCard(g, { ...MOVIES[0], source: 'rival', verified: true }, clock);
    expect(view(g, { kind: 'captain', team: 0 }).turn!.card).toBeNull();
    expect(view(g, { kind: 'captain', team: 1 }).turn!.card!.title).toBe(MOVIES[0].title);
    E.reveal(g, 0, ctx());
    expect(view(g, { kind: 'captain', team: 0 }).turn!.card!.title).toBe(MOVIES[0].title);
    expect(view(g, { kind: 'tv' }).turn!.card).toBeNull();
  });
});

describe('the rival picks a movie (server)', () => {
  const svc = (lookup: CharadesService['opts' & never] | ((t: string) => Promise<any>)) => {
    const changes: string[] = [];
    const s = new CharadesService({
      store: new Store(':memory:'),
      rng: { int: (m) => Math.floor(m / 2), id: () => Math.random().toString(36).slice(2) },
      onChange: (c) => changes.push(c),
      onSessionEnded: () => undefined,
      lookup: lookup as (t: string) => Promise<any>,
      lookupLabels: async () => ({ Q1: 'Shah Rukh Khan', Q2: 'romance film' }),
    });
    const { code, token } = s.create('Host');
    s.join(code, 0, 'Asha');
    s.join(code, 1, 'Ravi');
    const host = s.authenticate(code, token)!;
    s.handle(code, host, { type: 'update_settings', patch: { picker: 'rival', firstTeam: '0' } });
    s.handle(code, host, { type: 'start' });
    const room = s.get(code)!;
    const rival = { kind: 'captain' as const, team: 1 as TeamIdx, id: room.teams[1].captain!.id, sessionVersion: 1 };
    return { s, code, room, rival, host };
  };
  const pick = (x: ReturnType<typeof svc>, title: string) => x.s.handle(x.code, x.rival, { type: 'choose_movie', seq: x.room.seq, title });

  it('a deck title is accepted at once, with its details', () => {
    const x = svc(async () => null);
    expect(pick(x, 'jab we met!').ok).toBe(true);
    expect(x.room.turn).toMatchObject({ stage: 'ready', card: { title: 'Jab We Met', year: 2007, verified: true } });
  });

  it('more than four words is refused with a reason', () => {
    const x = svc(async () => null);
    pick(x, 'Rab Ne Bana Di Jodi');
    expect(x.room.turn!.stage).toBe('picking');
    expect(x.room.turn!.rivalNote).toMatch(/5 words/);
  });

  it('a film found online (Hindi, 2000+) becomes the card', async () => {
    const x = svc(async () => ({ id: 'Q9', label: 'Some New Film', year: 2024, hindi: true, castIds: ['Q1'], genreIds: ['Q2'] }));
    pick(x, 'some new film');
    expect(x.room.turn!.checking).toBe('some new film');
    await new Promise((r) => setTimeout(r, 10));
    expect(x.room.turn).toMatchObject({ stage: 'ready', card: { title: 'Some New Film', year: 2024, leads: ['Shah Rukh Khan'], genre: 'Romance', source: 'web' } });
  });

  it('too old or not Hindi is refused; not found goes to the host to approve', async () => {
    const old = svc(async () => ({ id: 'Q8', label: 'Sholay', year: 1975, hindi: true, castIds: [], genreIds: [] }));
    pick(old, 'Sholay');
    await new Promise((r) => setTimeout(r, 10));
    expect(old.room.turn!.rivalNote).toMatch(/1975/);

    const none = svc(async () => null);
    pick(none, 'Made Up Movie');
    await new Promise((r) => setTimeout(r, 10));
    expect(none.room.turn!.stage).toBe('approval');
    expect(view(none.room, { kind: 'host' }).turn!.pending!.title).toBe('Made Up Movie');
    none.s.handle(none.code, none.host, { type: 'approve', seq: none.room.seq, ok: true });
    expect(none.room.turn).toMatchObject({ stage: 'ready', card: { title: 'Made Up Movie', verified: false } });
  });

  it('the host can flip the card for a captain whose phone died; a captain’s swap never bounces the host’s judgement', () => {
    const x = svc(async () => null);
    x.s.handle(x.code, x.host, { type: 'update_settings', patch: { picker: 'deck' } });
    expect(x.s.handle(x.code, x.host, { type: 'reveal_here', seq: x.room.seq }).ok).toBe(true);
    expect(x.room.turn!.stage).toBe('acting');
    const old = x.room.seq;
    const actor = { kind: 'captain' as const, team: 0 as TeamIdx, id: x.room.teams[0].captain!.id, sessionVersion: 1 };
    expect(x.s.handle(x.code, actor, { type: 'swap', seq: x.room.seq }).ok).toBe(true);
    expect(x.s.handle(x.code, x.host, { type: 'judge', seq: old, result: 'correct' }).ok).toBe(true);
    expect(x.room.teams[0].score).toBe(1);
  });

  it('the acting team cannot pick its own movie', () => {
    const x = svc(async () => null);
    const me = { kind: 'captain' as const, team: 0 as TeamIdx, id: x.room.teams[0].captain!.id, sessionVersion: 1 };
    expect(x.s.handle(x.code, me, { type: 'choose_movie', seq: x.room.seq, title: 'Lagaan' }).error?.code).toBe('not_rival');
  });
});
