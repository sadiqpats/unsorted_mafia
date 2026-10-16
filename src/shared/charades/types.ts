import { z } from 'zod';
import type { Movie } from './movie';

export type TeamIdx = 0 | 1;

export const ROUND_OPTIONS = [3, 5, 7, 10, 15] as const;
export const TIMER_OPTIONS = [60, 90, 120, 150, 180] as const;
export const SWAP_OPTIONS = [0, 1, 2, 3] as const;

export const CSettingsSchema = z.object({
  /** Each round = one turn for each team. */
  rounds: z.number().int().min(1).max(30),
  turnSeconds: z.number().int().min(30).max(600),
  /** deck: the acting captain draws a random card. rival: the other captain picks (types one or sends a random card). */
  picker: z.enum(['deck', 'rival']),
  /** Card swaps allowed per turn (the clock keeps running). */
  swaps: z.number().int().min(0).max(5),
  /** easy = blockbusters only, mixed = well-known too, all = includes film-buff picks. */
  difficulty: z.enum(['easy', 'mixed', 'all']),
  /** Show "_ _ _" word blanks on the TV while acting. */
  showWordCount: z.boolean(),
  firstTeam: z.enum(['0', '1', 'random']),
});
export type CSettings = z.infer<typeof CSettingsSchema>;

export const DEFAULT_CSETTINGS: CSettings = {
  rounds: 5,
  turnSeconds: 120,
  picker: 'deck',
  swaps: 1,
  difficulty: 'mixed',
  showWordCount: true,
  firstTeam: 'random',
};

export interface Captain {
  id: string;
  name: string;
  tokenHash: string;
  sessionVersion: number;
}

export interface Team {
  name: string;
  score: number;
  captain: Captain | null;
}

/** A movie on a card. `source` says where it came from; typed rival picks may be unverified (host-approved). */
export interface Card extends Movie {
  source: 'deck' | 'rival' | 'web';
  verified: boolean;
}

export type Stage = 'picking' | 'approval' | 'ready' | 'acting' | 'done';
export type Result = 'correct' | 'pass' | 'timeout';

export interface Turn {
  n: number;
  round: number;
  team: TeamIdx;
  stage: Stage;
  card: Card | null;
  /** Rival's typed title waiting on the host (couldn't be verified online). */
  pending: { title: string; reason: string } | null;
  /** Title being checked online right now (rival mode). */
  checking: string | null;
  /** Message for the rival captain (e.g. why a title was refused). */
  rivalNote: string | null;
  swapsLeft: number;
  startedAt: number | null;
  endsAt: number | null;
  /** Remaining ms while paused. */
  pausedLeft: number | null;
  result: Result | null;
  tookMs: number | null;
  swapped: string[];
}

export interface TurnRecord {
  n: number;
  round: number;
  team: TeamIdx;
  title: string;
  year: number;
  result: Result;
  tookMs: number | null;
  source: Card['source'];
}

export interface CRoom {
  code: string;
  createdAt: number;
  updatedAt: number;
  status: 'lobby' | 'playing' | 'over' | 'closed';
  hostName: string;
  hostTokenHash: string;
  hostSessionVersion: number;
  teams: [Team, Team];
  settings: CSettings;
  turn: Turn | null;
  history: TurnRecord[];
  /** Movie ids already used this session (never dealt twice). */
  used: string[];
  /** Bumps on every change; commands quote it so stale taps are refused. */
  seq: number;
  recentActions: string[];
}

// ------------------------------------------------------------------ protocol

const seq = z.number().int().nonnegative();
export const CHostCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('update_settings'), patch: CSettingsSchema.partial() }),
  z.object({ type: z.literal('rename_team'), team: z.union([z.literal(0), z.literal(1)]), name: z.string().trim().min(1).max(24) }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('kick_captain'), team: z.union([z.literal(0), z.literal(1)]) }),
  z.object({ type: z.literal('random_card'), seq }),
  /** Captain's phone died: the host flips the card on their own screen. */
  z.object({ type: z.literal('reveal_here'), seq }),
  z.object({ type: z.literal('approve'), seq, ok: z.boolean() }),
  z.object({ type: z.literal('judge'), seq, result: z.enum(['correct', 'pass']) }),
  z.object({ type: z.literal('pause'), seq }),
  z.object({ type: z.literal('resume'), seq }),
  z.object({ type: z.literal('fix_result'), seq }),
  z.object({ type: z.literal('next_turn'), seq }),
  z.object({ type: z.literal('end_game') }),
  z.object({ type: z.literal('one_more_round') }),
  z.object({ type: z.literal('play_again') }),
]);
export const CCaptainCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('reveal'), seq }),
  z.object({ type: z.literal('swap'), seq }),
  z.object({ type: z.literal('give_up'), seq }),
  z.object({ type: z.literal('choose_movie'), seq, title: z.string().trim().min(1).max(80).optional(), random: z.boolean().optional() }),
]);
export type CHostCommand = z.infer<typeof CHostCommandSchema>;
export type CCaptainCommand = z.infer<typeof CCaptainCommandSchema>;
export type CCommand = (CHostCommand | CCaptainCommand) & { actionId?: string };

// ------------------------------------------------------------------ views

export interface CardView {
  title: string;
  year: number | null;
  genre: string;
  leads: string[];
  words: number;
  source: Card['source'];
  verified: boolean;
}

export interface CView {
  code: string;
  status: CRoom['status'];
  hostName: string;
  serverNow: number;
  seq: number;
  settings: CSettings;
  teams: { name: string; score: number; captain: { name: string; online: boolean } | null }[];
  turn: {
    n: number;
    round: number;
    team: TeamIdx;
    stage: Stage;
    endsAt: number | null;
    pausedLeft: number | null;
    swapsLeft: number;
    result: Result | null;
    tookMs: number | null;
    /** Word count of the movie being acted (if the house rule shows it). */
    words: number | null;
    /** Only for those allowed to see it (see views). */
    card: CardView | null;
    checking: boolean;
    pending: { title: string; reason: string } | null;
  } | null;
  history: TurnRecord[];
  winner: TeamIdx | 'tie' | null;
  /** Who is looking. */
  me: { kind: 'host' } | { kind: 'captain'; team: TeamIdx; name: string; rivalNote: string | null } | { kind: 'tv' };
}
