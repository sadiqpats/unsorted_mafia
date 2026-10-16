import type { Movie } from './movie';
import { wordCount } from './movie';
import { DEFAULT_CSETTINGS, type Card, type CRoom, type CSettings, type Result, type TeamIdx, type Turn } from './types';

/**
 * Bollywood Dumb Charades — the rules as a pure state machine. The server owns
 * the clock, the deck and the dice; this file only decides what each command does.
 */
export class CharadesError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const fail = (code: string, message: string): never => {
  throw new CharadesError(code, message);
};

export interface Ctx {
  now: number;
  rng: { int: (max: number) => number };
  deck: Movie[];
}

const TIERS: Record<CSettings['difficulty'], number> = { easy: 1, mixed: 2, all: 3 };

export function createCRoom(input: { code: string; hostName: string; hostTokenHash: string; now: number }): CRoom {
  return {
    code: input.code,
    createdAt: input.now,
    updatedAt: input.now,
    status: 'lobby',
    hostName: input.hostName,
    hostTokenHash: input.hostTokenHash,
    hostSessionVersion: 1,
    teams: [
      { name: 'Team 1', score: 0, captain: null },
      { name: 'Team 2', score: 0, captain: null },
    ],
    settings: { ...DEFAULT_CSETTINGS },
    turn: null,
    history: [],
    used: [],
    seq: 1,
    recentActions: [],
  };
}

const touch = (room: CRoom, now: number) => {
  room.seq += 1;
  room.updatedAt = now;
};

/** A random card nobody has had yet (within the difficulty). Starts reusing only when the deck runs dry. */
export function drawCard(room: CRoom, ctx: Ctx): Card {
  const maxTier = TIERS[room.settings.difficulty];
  const used = new Set(room.used);
  const pool = ctx.deck.filter((m) => m.tier <= maxTier);
  let fresh = pool.filter((m) => !used.has(m.id));
  if (!fresh.length) {
    // Everything has been played: forget the history for this difficulty and go round again.
    const ids = new Set(pool.map((m) => m.id));
    room.used = room.used.filter((id) => !ids.has(id));
    fresh = pool;
  }
  if (!fresh.length) fail('empty_deck', 'The deck is empty.');
  const m = fresh[ctx.rng.int(fresh.length)];
  room.used.push(m.id);
  return { ...m, source: 'deck', verified: true };
}

function newTurn(room: CRoom, n: number, team: TeamIdx): Turn {
  return {
    n,
    round: Math.ceil(n / 2),
    team,
    stage: 'picking',
    card: null,
    cards: [],
    current: 0,
    pending: null,
    checking: null,
    rivalNote: null,
    swapsLeft: room.settings.swaps,
    startedAt: null,
    endsAt: null,
    pausedLeft: null,
    result: null,
    tookMs: null,
    swapped: [],
  };
}

/** The team that acts on turn n (teams alternate; `first` acts on odd turns). */
/** The team that acted on turn 1 (odd turns), worked out from the current turn. */
const firstTeamOf = (room: CRoom): TeamIdx => {
  const t = room.turn;
  if (!t) return 0;
  return (t.n % 2 === 1 ? t.team : 1 - t.team) as TeamIdx;
};

function requireTurn(room: CRoom, ...stages: Turn['stage'][]): Turn {
  if (room.status !== 'playing' || !room.turn) return fail('not_playing', 'The game isn’t running.');
  if (stages.length && !stages.includes(room.turn.stage)) return fail('wrong_stage', 'That isn’t possible right now.');
  return room.turn;
}

export function checkSeq(room: CRoom, seq: number) {
  if (seq !== room.seq) fail('stale', 'The game moved on — try again.');
}

// ------------------------------------------------------------------ lobby

export function updateSettings(room: CRoom, patch: Partial<CSettings>, now: number) {
  if (room.status === 'playing') {
    // Only harmless tweaks mid-game: rounds (not below what's been played), timer, swaps, word count.
    const played = room.turn ? room.turn.round : 0;
    if (patch.rounds !== undefined && patch.rounds < played) fail('bad_settings', `You’re already in round ${played}.`);
    const allowed: (keyof CSettings)[] = ['rounds', 'turnSeconds', 'swaps', 'showWordCount', 'difficulty', 'picker', 'hostSeesMovie'];
    for (const k of Object.keys(patch) as (keyof CSettings)[]) if (!allowed.includes(k)) fail('bad_settings', 'That can only change in the lobby.');
  } else if (room.status !== 'lobby' && room.status !== 'over') fail('bad_settings', 'Settings can’t change now.');
  room.settings = { ...room.settings, ...patch };
  touch(room, now);
}

export function renameTeam(room: CRoom, team: TeamIdx, name: string, now: number) {
  const clean = name.trim().slice(0, 24);
  if (!clean) fail('bad_name', 'Give the team a name.');
  if (room.teams[1 - team].name.toLowerCase() === clean.toLowerCase()) fail('bad_name', 'Both teams can’t have the same name.');
  room.teams[team].name = clean;
  touch(room, now);
}

export function joinCaptain(room: CRoom, team: TeamIdx, captain: { id: string; name: string; tokenHash: string }, now: number) {
  if (room.status === 'closed') fail('room_closed', 'This room has closed.');
  if (room.teams[team].captain) fail('seat_taken', `${room.teams[team].name} already has a captain.`);
  const other = room.teams[1 - team].captain;
  if (other && other.name.toLowerCase() === captain.name.trim().toLowerCase()) fail('name_taken', 'The other captain already uses that name.');
  room.teams[team].captain = { ...captain, name: captain.name.trim(), sessionVersion: 1 };
  touch(room, now);
}

export function kickCaptain(room: CRoom, team: TeamIdx, now: number) {
  if (!room.teams[team].captain) fail('no_captain', 'That team has no captain yet.');
  room.teams[team].captain = null;
  touch(room, now);
}

export function start(room: CRoom, ctx: Ctx) {
  if (room.status !== 'lobby') fail('not_lobby', 'The game has already started.');
  if (!room.teams[0].captain || !room.teams[1].captain) fail('need_captains', 'Both team captains need to join first.');
  const first: TeamIdx = room.settings.firstTeam === 'random' ? (ctx.rng.int(2) as TeamIdx) : (Number(room.settings.firstTeam) as TeamIdx);
  room.teams.forEach((t) => (t.score = 0));
  room.history = [];
  room.status = 'playing';
  room.turn = newTurn(room, 1, first);
  touch(room, ctx.now);
}

// ------------------------------------------------------------------ picking

/** Acting captain flips the card: the movie appears on their phone and the clock starts. */
export function reveal(room: CRoom, team: TeamIdx, ctx: Ctx) {
  const t = requireTurn(room, 'picking', 'ready');
  if (team !== t.team) fail('not_your_turn', 'It’s the other team’s turn.');
  if (t.stage === 'picking') {
    if (room.settings.picker === 'rival') fail('wait_rival', `Waiting for ${room.teams[1 - t.team].name} to pick your movie.`);
    t.card = drawCard(room, ctx);
  }
  t.cards = [t.card!];
  t.current = 0;
  t.stage = 'acting';
  t.startedAt = ctx.now;
  t.endsAt = ctx.now + room.settings.turnSeconds * 1000;
  t.pausedLeft = null;
  touch(room, ctx.now);
}

/** Rival mode: the other team's captain sends a movie (already verified by the server, or a random card). */
export function setRivalCard(room: CRoom, card: Card, now: number) {
  const t = requireTurn(room, 'picking', 'approval');
  t.card = card;
  t.cards = [card];
  t.current = 0;
  t.pending = null;
  t.checking = null;
  t.rivalNote = null;
  t.stage = 'ready';
  if (card.source === 'deck' || card.source === 'web' || card.source === 'rival') room.used.push(card.id);
  touch(room, now);
}

/** Rival typed something we couldn't confirm online: the host decides. */
export function askHost(room: CRoom, title: string, reason: string, now: number) {
  const t = requireTurn(room, 'picking');
  t.pending = { title, reason };
  t.checking = null;
  t.stage = 'approval';
  touch(room, now);
}

export function refuseRival(room: CRoom, note: string, now: number) {
  const t = requireTurn(room, 'picking', 'approval');
  t.pending = null;
  t.checking = null;
  t.stage = 'picking';
  t.rivalNote = note;
  touch(room, now);
}

export function setChecking(room: CRoom, title: string | null, now: number) {
  const t = requireTurn(room, 'picking');
  t.checking = title;
  t.rivalNote = null;
  touch(room, now);
}

/** Host: approve or refuse a title that couldn't be verified. */
export function approve(room: CRoom, ok: boolean, now: number) {
  const t = requireTurn(room, 'approval');
  const p = t.pending!;
  if (!ok) return refuseRival(room, `The host didn’t accept “${p.title}”. Pick another one.`, now);
  setRivalCard(room, { id: `typed:${p.title.toLowerCase()}`, title: p.title, year: 0, genre: '', leads: [], tier: 2, source: 'rival', verified: false }, now);
}

/** Host (or rival): skip the choosing and deal a random card. */
export function randomForTurn(room: CRoom, ctx: Ctx) {
  const t = requireTurn(room, 'picking', 'approval');
  if (t.checking) fail('busy', 'Still checking a movie — give it a second.');
  setRivalCard(room, drawCard(room, ctx), ctx.now);
}

// ------------------------------------------------------------------ acting

/** Draw a fresh card. Earlier cards stay in the turn so the captain can flip back to them. */
export function swap(room: CRoom, team: TeamIdx, ctx: Ctx) {
  const t = requireTurn(room, 'acting');
  if (team !== t.team) fail('not_your_turn', 'It’s the other team’s turn.');
  const cards = t.cards ?? (t.card ? [t.card] : []);
  if (cards[0]?.source !== 'deck') fail('no_swap', 'The other team chose this movie — no swapping.');
  if (t.swapsLeft <= 0) fail('no_swaps', 'No new cards left this turn.');
  if (t.pausedLeft !== null) fail('paused', 'The game is paused.');
  t.swapped.push(t.card!.title);
  t.swapsLeft -= 1;
  const card = drawCard(room, ctx);
  t.cards = [...cards, card];
  t.current = t.cards.length - 1;
  t.card = card;
  touch(room, ctx.now);
}

/** Flip back (or forward) to another card drawn this turn; that one is now being acted. */
export function showCard(room: CRoom, team: TeamIdx, index: number, now: number) {
  const t = requireTurn(room, 'acting');
  if (team !== t.team) fail('not_your_turn', 'It’s the other team’s turn.');
  const cards = t.cards ?? [];
  if (index < 0 || index >= cards.length) fail('no_card', 'No such card.');
  if (index === t.current) return;
  t.current = index;
  t.card = cards[index];
  touch(room, now);
}

/** The acting captain confirms the guess (for games where the host plays and can't see the movie). */
export function captainGotIt(room: CRoom, team: TeamIdx, now: number) {
  const t = requireTurn(room, 'acting');
  if (team !== t.team) fail('not_your_turn', 'It’s the other team’s turn.');
  finish(room, 'correct', now);
}

function finish(room: CRoom, result: Result, now: number) {
  const t = room.turn!;
  t.stage = 'done';
  t.result = result;
  t.tookMs = t.pausedLeft !== null ? room.settings.turnSeconds * 1000 - t.pausedLeft : t.startedAt !== null ? Math.min(now, t.endsAt ?? now) - t.startedAt : null;
  t.pausedLeft = null;
  if (result === 'correct') room.teams[t.team].score += 1;
  room.history.push({ n: t.n, round: t.round, team: t.team, title: t.card?.title ?? '—', year: t.card?.year ?? 0, result, tookMs: t.tookMs, source: t.card?.source ?? 'deck' });
  touch(room, now);
}

export function giveUp(room: CRoom, team: TeamIdx, now: number) {
  const t = requireTurn(room, 'acting');
  if (team !== t.team) fail('not_your_turn', 'It’s the other team’s turn.');
  finish(room, 'pass', now);
}

export function judge(room: CRoom, result: 'correct' | 'pass', now: number) {
  requireTurn(room, 'acting');
  finish(room, result, now);
}

export function pause(room: CRoom, now: number) {
  const t = requireTurn(room, 'acting');
  if (t.pausedLeft !== null) return;
  t.pausedLeft = Math.max(0, (t.endsAt ?? now) - now);
  touch(room, now);
}

export function resume(room: CRoom, now: number) {
  const t = requireTurn(room, 'acting');
  if (t.pausedLeft === null) return;
  t.endsAt = now + t.pausedLeft;
  t.startedAt = t.endsAt - room.settings.turnSeconds * 1000;
  t.pausedLeft = null;
  touch(room, now);
}

/** Server clock: time's up. Returns true when something changed. */
export function tick(room: CRoom, now: number): boolean {
  const t = room.turn;
  if (room.status !== 'playing' || !t || t.stage !== 'acting' || t.pausedLeft !== null || t.endsAt === null) return false;
  if (now < t.endsAt) return false;
  finish(room, 'timeout', now);
  return true;
}

// ------------------------------------------------------------------ after a turn

/** Host fixes a mistake: flips the last result between "got it" and "missed". */
export function fixResult(room: CRoom, now: number) {
  const t = requireTurn(room, 'done');
  const last = room.history[room.history.length - 1];
  if (t.result === 'correct') {
    room.teams[t.team].score -= 1;
    t.result = 'pass';
  } else {
    room.teams[t.team].score += 1;
    t.result = 'correct';
  }
  if (last && last.n === t.n) last.result = t.result;
  touch(room, now);
}

export function winnerOf(room: CRoom): TeamIdx | 'tie' {
  const [a, b] = room.teams.map((t) => t.score);
  return a === b ? 'tie' : a > b ? 0 : 1;
}

export function nextTurn(room: CRoom, now: number) {
  const t = requireTurn(room, 'done');
  if (t.n >= room.settings.rounds * 2) {
    room.status = 'over';
    touch(room, now);
    return;
  }
  const first = firstTeamOf(room);
  const n = t.n + 1;
  room.turn = newTurn(room, n, (n % 2 === 1 ? first : 1 - first) as TeamIdx);
  touch(room, now);
}

export function endGame(room: CRoom, now: number) {
  if (room.status !== 'playing') fail('not_playing', 'The game isn’t running.');
  const t = room.turn;
  if (t && t.stage === 'acting') finish(room, 'pass', now);
  room.status = 'over';
  touch(room, now);
}

/**
 * Tie-breaker (or just more fun). After a finished game: one more round. After the
 * host ended early: finish the round that was cut short (so both teams get the same
 * number of turns) and then play one more.
 */
export function oneMoreRound(room: CRoom, now: number) {
  if (room.status !== 'over' || !room.turn) fail('not_over', 'Finish the game first.');
  const t = room.turn!;
  const first = firstTeamOf(room);
  const n = t.stage === 'done' ? t.n + 1 : t.n;
  room.settings.rounds = Math.ceil(n / 2) + (n % 2 === 0 ? 1 : 0);
  room.status = 'playing';
  room.turn = newTurn(room, n, (n % 2 === 1 ? first : 1 - first) as TeamIdx);
  touch(room, now);
}

/** Back to the lobby with the same captains; scores reset, played movies stay out of the deck. */
export function playAgain(room: CRoom, now: number) {
  if (room.status !== 'over') fail('not_over', 'Finish the game first.');
  room.status = 'lobby';
  room.turn = null;
  room.history = [];
  room.teams.forEach((t) => (t.score = 0));
  touch(room, now);
}

export const cardWords = (c: Card | null) => (c ? wordCount(c.title) : null);
