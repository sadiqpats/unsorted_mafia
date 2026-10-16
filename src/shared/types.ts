import type { Settings } from './settings';

export type Alignment = 'good' | 'mafia' | 'neutral';

export type Phase =
  | 'lobby'
  | 'reveal'
  | 'prenight'
  | 'night'
  | 'morning'
  | 'discussion'
  | 'voting'
  | 'verdict'
  | 'game_over';

export type RoomStatus = 'lobby' | 'active' | 'over' | 'closed';

/** A stolen ability currently held by a Thief. */
export interface StolenAbility {
  abilityId: string;
  fromId: string;
  /** null = unlimited */
  charges: number | null;
  mode: 'copy' | 'take';
  duration: 'oneUse' | 'permanent';
}

export interface Player {
  id: string;
  name: string;
  seat: number;
  /** SHA-256 of the player's session token. The raw token never touches the database. */
  tokenHash: string;
  isHost: boolean;
  ready: boolean;
  joinedAt: number;
  /** Bumped whenever the host issues a rejoin code — invalidates the old device. */
  sessionVersion: number;
  rejoinCodeHash: string | null;
  /** Bumped on every photo change; null = no photo. Photo bytes live in their own table. */
  photoVersion?: number | null;

  // ---- In-game state (reset on every new game) ----
  alive: boolean;
  roleId: string | null;
  originalRoleId: string | null;
  revealAck: boolean;
  deathRound: number | null;
  deathCause: 'night' | 'vote' | 'host' | null;
  /** abilityId -> remaining uses. Missing key = unlimited. */
  charges: Record<string, number>;
  stolen: StolenAbility | null;
  /** Abilities taken from this player by a Thief (take mode). */
  lostAbilities: string[];
  thiefTargets: string[];
  silencedRound: number | null;
  noVoteRound: number | null;
  lastReviveRound: number | null;
  /** Doctor: last round they protected themselves (self-save is blocked the following round). */
  lastSelfProtectRound?: number | null;
  /** Thief: last power taken and when (the same power can't be taken two rounds in a row). */
  lastStolenAbility?: string | null;
  lastStealRound?: number | null;
  revivedCount: number;
  lateJoiner: boolean;
}

export interface NightAction {
  actorId: string;
  abilityId: string; // 'decoy' for players without a night ability
  targetId: string | null; // null = skipped
  at: number;
}

export interface Vote {
  voterId: string;
  targetId: string | null; // null = abstain
  weight: number;
  rally: boolean;
  at: number;
}

export interface LogEntry {
  seq: number;
  at: number;
  round: number;
  phase: Phase;
  kind: string;
  /** public: everyone; host: host dashboard / audit only. */
  visibility: 'public' | 'host';
  text: string;
}

export interface PrivateResult {
  id: string;
  playerId: string;
  round: number;
  kind: string;
  text: string;
  at: number;
}

export interface Verdict {
  round: number;
  eliminatedId: string | null;
  tie: boolean;
  runoff: boolean;
  /** target id (or 'abstain') -> weighted total */
  tally: Record<string, number>;
  /** voterId -> targetId|null */
  votes: Record<string, string | null>;
  jesterWin: boolean;
  decidedByHost: boolean;
}

export interface WinResult {
  faction: 'good' | 'mafia' | 'jester' | 'draw' | 'none';
  winnerIds: string[];
  reason: string;
}

export interface MorningReport {
  round: number;
  deaths: string[];
  revived: string[];
  silenced: string[];
  saved: boolean;
}

export interface Game {
  settings: Settings;
  phase: Phase;
  round: number;
  /** Strictly increasing. Every client action must quote the current value — stale actions are rejected. */
  phaseSeq: number;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
  night: { actions: Record<string, NightAction> };
  day: { votes: Record<string, Vote>; runoff: string[] | null; runoffUsed: boolean };
  pendingTie: string[] | null;
  lastVerdict: Verdict | null;
  lastMorning: MorningReport | null;
  winner: WinResult | null;
  jesterWinners: string[];
  stats: {
    suspicion: Record<string, number>;
    nightKills: number;
    saves: number;
    revives: number;
    voteEliminations: number;
    investigations: number;
  };
  startedAt: number;
  endedAt: number | null;
  /** News for the current phase = public log entries after this seq (announcements since the previous phase began). */
  newsFromSeq?: number;
  /** Private notes newer than this time belong to the current phase. */
  newsFromAt?: number;
  /** Log seq / time at which the current phase began. */
  phaseLogSeq?: number;
}

export interface Room {
  code: string;
  createdAt: number;
  updatedAt: number;
  status: RoomStatus;
  hostName: string;
  hostTokenHash: string;
  hostPlayerId: string | null;
  settings: Settings;
  players: Player[];
  game: Game | null;
  log: LogEntry[];
  logSeq: number;
  privateResults: PrivateResult[];
  /** Recent idempotency keys per actor, so a retried request is answered without re-applying it. */
  recentActionIds: Record<string, string[]>;
  gamesPlayed: number;
  nextSeat: number;
}
