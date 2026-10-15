import type { DistributionReport } from './distribution';
import type { NightOption } from './engine';
import type { Settings } from './settings';
import type { Alignment, LogEntry, MorningReport, Phase, RoomStatus, StolenAbility, Verdict, WinResult } from './types';

/** What every viewer (including the TV display) may see. Contains NO secrets. */
export interface PublicPlayer {
  id: string;
  name: string;
  seat: number;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  alive: boolean;
  /** Publicly silenced today (only when the house rule announces it). */
  silenced: boolean;
  /** Only set when the role is public: revealed on death (house rule) or at game over. */
  revealedRoleId: string | null;
  deathCause: 'night' | 'vote' | 'host' | null;
  /** URL of the player's photo (public within the room), or null. */
  photo: string | null;
}

export interface PublicGame {
  phase: Phase;
  round: number;
  phaseSeq: number;
  phaseEndsAt: number | null;
  paused: boolean;
  pausedRemainingMs: number | null;
  nightProgress: { done: number; total: number } | null;
  votingProgress: { done: number; total: number } | null;
  revealProgress: { done: number; total: number } | null;
  runoff: string[] | null;
  pendingTie: string[] | null;
  lastMorning: MorningReport | null;
  lastVerdict: Verdict | null;
  winner: WinResult | null;
  stats: { suspicion: Record<string, number>; nightKills: number; saves: number; revives: number; voteEliminations: number; investigations: number } | null;
  aliveCount: number;
}

export interface PublicView {
  kind: 'public' | 'player' | 'host';
  serverNow: number;
  code: string;
  status: RoomStatus;
  hostName: string;
  gamesPlayed: number;
  settings: Settings;
  distribution: DistributionReport;
  players: PublicPlayer[];
  game: PublicGame | null;
  feed: LogEntry[];
}

export interface MeView {
  id: string;
  name: string;
  isHost: boolean;
  alive: boolean;
  roleId: string | null;
  alignment: Alignment | null;
  abilities: { abilityId: string; source: 'role' | 'stolen'; charges: number | null }[];
  stolen: StolenAbility | null;
  lostAbilities: string[];
  silenced: boolean;
  revealAck: boolean;
  vote: {
    eligible: boolean;
    reason: string | null;
    targets: string[];
    myVote: string | null | undefined; // undefined = not voted
    rallyAvailable: boolean;
    weight: number;
  } | null;
  night: {
    options: NightOption[];
    submitted: Record<string, string | null>;
  } | null;
  mafia: { team: { id: string; name: string; roleId: string }[]; votes: Record<string, string | null> } | null;
  privateResults: { id: string; round: number; kind: string; text: string }[];
  allRoles: Record<string, string> | null;
}

export interface HostPanel {
  /** False when the host is also playing — the dashboard then carries no secrets. */
  secrets: boolean;
  roles: Record<string, string> | null;
  nightActions: { actorId: string; abilityId: string; targetId: string | null }[] | null;
  votes: { voterId: string; targetId: string | null; weight: number }[] | null;
  nightSubmitted: Record<string, boolean>;
  voteSubmitted: Record<string, boolean>;
  log: LogEntry[];
  alignmentAlive: Record<Alignment, number> | null;
  winPreview: WinResult | null;
}

export interface ClientView extends PublicView {
  me: MeView | null;
  host: HostPanel | null;
}
