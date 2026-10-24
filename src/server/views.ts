/**
 * PRIVACY BOUNDARY
 * ----------------
 * The full Room object never leaves the server. Each connected socket receives a
 * projection built here, according to who it authenticated as:
 *   - public  (TV display / unauthenticated spectator): public information only
 *   - player: public + their own role, own actions, own private results
 *   - host:   public + (if the host is NOT playing) every role, action and vote
 * Tests in tests/integration/privacy.test.ts verify that no other player's role
 * or action ever appears in a player's payload.
 */
import { analyzeDistribution } from '../shared/distribution';
import {
  checkWin,
  eligibleVoters,
  hasRally,
  hasUsable,
  heldAbilities,
  hitVoters,
  inMafiaChat,
  mafiaLeader,
  nightOptions,
  voteEligibility,
  voteTargets,
  voteWeight,
} from '../shared/engine';
import { ROLES, isKiller, isMafiaTeam, roleAlignment, roleShort } from '../shared/roles';
import type { Alignment, Room } from '../shared/types';
import type { ClientView, HostPanel, MeView, PublicGame, PublicPlayer, PublicView } from '../shared/view-types';

export type Viewer = { kind: 'public' } | { kind: 'player'; playerId: string } | { kind: 'host' };

const FEED_LIMIT = 80;
/** Announcement kinds that belong in a phase's news card (not joins, phase chatter, etc.). */
const NEWS_KINDS = new Set(['morning', 'prenight', 'verdict', 'gm', 'correction', 'pause']);

function publicSilenced(room: Room, silencedRound: number | null): boolean {
  const g = room.game;
  if (!g || silencedRound === null || silencedRound !== g.round) return false;
  if (!g.settings.announceSilenced) return false;
  return ['morning', 'discussion', 'voting', 'verdict'].includes(g.phase);
}

export function buildPublic(room: Room, connected: Set<string>, now: number): PublicView {
  const g = room.game;
  const settings = g?.settings ?? room.settings;
  const over = g?.phase === 'game_over';
  const players: PublicPlayer[] = [...room.players]
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      isHost: p.isHost,
      ready: p.ready,
      connected: connected.has(p.id),
      alive: p.alive,
      silenced: publicSilenced(room, p.silencedRound),
      revealedRoleId: over || (g && !p.alive && settings.revealRoleOnDeath) ? p.roleId : null,
      deathCause: g && !p.alive ? p.deathCause : null,
      photo: p.photoVersion ? `/api/rooms/${room.code}/photos/${p.id}?v=${p.photoVersion}` : null,
    }));

  let game: PublicGame | null = null;
  if (g) {
    const night = g.phase === 'night' || g.phase === 'prenight';
    let nightProgress = null;
    if (night) {
      let total = 0;
      let done = 0;
      for (const p of room.players) {
        const opts = nightOptions(room, p.id);
        if (!opts.length) continue;
        total++;
        if (opts.every((o) => g.night.actions[`${p.id}:${o.abilityId}`])) done++;
      }
      nightProgress = { done, total };
    }
    const voters = g.phase === 'voting' ? eligibleVoters(room) : [];
    const verdict = g.lastVerdict
      ? {
          ...g.lastVerdict,
          tally: settings.voteReveal === 'outcome' && !over ? {} : g.lastVerdict.tally,
          votes: settings.voteReveal === 'full' || over ? g.lastVerdict.votes : {},
          jesterWin: over || settings.revealRoleOnDeath || settings.jesterEndsGame ? g.lastVerdict.jesterWin : false,
        }
      : null;
    const morning = g.lastMorning ? { ...g.lastMorning, saved: settings.announceSaves ? g.lastMorning.saved : false, silenced: settings.announceSilenced ? g.lastMorning.silenced : [] } : null;
    game = {
      phase: g.phase,
      round: g.round,
      phaseSeq: g.phaseSeq,
      phaseEndsAt: g.phaseEndsAt,
      phaseOpensAt: g.phaseOpensAt ?? null,
      paused: g.pausedRemainingMs !== null,
      pausedRemainingMs: g.pausedRemainingMs,
      nightProgress,
      votingProgress: g.phase === 'voting' ? { done: voters.filter((p) => g.day.votes[p.id]).length, total: voters.length } : null,
      revealProgress: g.phase === 'reveal' ? { done: room.players.filter((p) => p.revealAck).length, total: room.players.length } : null,
      runoff: g.day.runoff,
      pendingTie: g.pendingTie,
      lastMorning: morning,
      lastVerdict: verdict,
      mafiaLeft: g.mafiaLeft ?? null,
      lastDawn: g.lastDawn ?? null,
      winner: g.winner,
      endedAt: g.endedAt,
      stats: over ? g.stats : null,
      aliveCount: room.players.filter((p) => p.alive).length,
      news: room.log.filter((l) => l.visibility === 'public' && NEWS_KINDS.has(l.kind) && l.seq > (g.newsFromSeq ?? 0)),
      newsFromAt: g.newsFromAt ?? 0,
    };
  }

  return {
    kind: 'public',
    serverNow: now,
    code: room.code,
    status: room.status,
    hostName: room.hostName,
    gamesPlayed: room.gamesPlayed,
    settings,
    distribution: analyzeDistribution(room.settings, room.status === 'lobby' ? undefined : room.players.length),
    players,
    game,
    // Only this game's announcements (a rematch starts with a clean list).
    feed: room.log.filter((l) => l.visibility === 'public' && (!room.game || l.seq > (room.game.startLogSeq ?? 0))).slice(-FEED_LIMIT),
  };
}

function buildMe(room: Room, playerId: string, now: number): MeView | null {
  const p = room.players.find((x) => x.id === playerId);
  if (!p) return null;
  const g = room.game;
  const s = g?.settings ?? room.settings;
  const inGame = !!g && !!p.roleId;
  let vote: MeView['vote'] = null;
  if (g && g.phase === 'voting') {
    const e = voteEligibility(room, p);
    const v = g.day.votes[p.id];
    vote = {
      eligible: e.ok,
      reason: e.reason ?? null,
      targets: e.ok ? voteTargets(room, p) : [],
      myVote: v ? v.targetId : undefined,
      rallyAvailable: e.ok && hasRally(room, p),
      weight: e.ok ? voteWeight(room, p, false) : 0,
    };
  }
  let night: MeView['night'] = null;
  if (g && (g.phase === 'night' || g.phase === 'prenight')) {
    const options = nightOptions(room, p.id);
    const submitted: Record<string, string | null> = {};
    for (const o of options) {
      const a = g.night.actions[`${p.id}:${o.abilityId}`];
      if (a) submitted[o.abilityId] = a.targetId;
    }
    night = { options, submitted };
  }
  let mafia: MeView['mafia'] = null;
  if (inGame && isKiller(p, s)) {
    const team = room.players
      .filter((x) => isMafiaTeam(x.roleId, s) || x.id === p.id)
      .map((x) => ({ id: x.id, name: x.name, roleId: x.roleId!, canAct: x.alive && !!hasUsable(room, x, 'mafia_kill') }));
    mafia = { team };
  }
  let hitPlan: MeView['hitPlan'] = null;
  if (g && g.phase === 'night' && p.alive) {
    const voters = hitVoters(room);
    const youVote = voters.some((v) => v.id === p.id);
    if (voters.length > 0 && (youVote || isKiller(p, s))) {
      // Shuffled per night (stable within it) so a slot number never maps to a seat. The server-only
      // secret in the key stops anyone recomputing the order from the (public) player ids.
      const key = (id: string) => slotHash(`${room.hostTokenHash}:${g.phaseSeq}:${id}`);
      const order = [...voters].sort((a, b) => key(a.id) - key(b.id));
      const leader = mafiaLeader(room);
      hitPlan = {
        slots: order.map((v, i) => {
          const act = g.night.actions[`${v.id}:mafia_kill`];
          return { label: `Mafia ${i + 1}`, you: v.id === p.id, ...(act ? { pick: act.targetId } : {}) };
        }),
        youVote,
        leaderLabel: leader ? `Mafia ${order.findIndex((v) => v.id === leader.id) + 1}` : null,
      };
    }
  }
  const mafiaChat =
    inGame && s.mafiaChat !== false && inMafiaChat(p, s)
      ? (g!.mafiaChat ?? []).map((m) => {
          const from = room.players.find((x) => x.id === m.from);
          const gf = from?.roleId === 'godfather';
          return {
            seq: m.seq,
            at: m.at,
            text: m.text,
            name: gf ? roleShort('godfather', s) : (from?.name ?? '?'),
            photo: !gf && from?.photoVersion ? `/api/rooms/${room.code}/photos/${from.id}?v=${from.photoVersion}` : null,
            godfather: gf,
            you: m.from === p.id,
          };
        })
      : null;
  const nameInChat = (id: string) => {
    const from = room.players.find((x) => x.id === id);
    const gf = from?.roleId === 'godfather';
    return { gf, name: gf ? roleShort('godfather', s) : (from?.name ?? '?'), from };
  };
  const mafiaTyping =
    mafiaChat === null
      ? null
      : Object.entries(g!.mafiaTyping ?? {})
          .filter(([id, until]) => id !== p.id && until > now)
          .map(([id, until]) => {
            const n = nameInChat(id);
            return { name: n.name, godfather: n.gf, msLeft: until - now };
          });
  const knownMafia =
    inGame && ROLES[p.roleId!]?.knowsMafia ? room.players.filter((x) => isMafiaTeam(x.roleId, s)).map((x) => ({ id: x.id, name: x.name })) : null;
  const allRoles = g && ((!p.alive && s.deadCanSeeRoles) || g.phase === 'game_over') ? Object.fromEntries(room.players.map((x) => [x.id, x.roleId ?? ''])) : null;
  return {
    id: p.id,
    name: p.name,
    isHost: p.isHost,
    alive: p.alive,
    roleId: inGame ? p.roleId : null,
    alignment: inGame ? roleAlignment(p.roleId, s) : null,
    heir: inGame && !!p.heir,
    abilities: inGame ? heldAbilities(room, p) : [],
    stolen: inGame ? p.stolen : null,
    lostAbilities: inGame ? p.lostAbilities : [],
    silenced: !!g && p.silencedRound === g.round && g.phase !== 'night' && g.phase !== 'prenight',
    revealAck: p.revealAck,
    vote,
    night,
    mafia,
    hitPlan,
    knownMafia,
    mafiaChat,
    mafiaTyping,
    privateResults: room.privateResults.filter((r) => r.playerId === p.id).map((r) => ({ id: r.id, round: r.round, kind: r.kind, text: r.text, at: r.at })),
    allRoles,
  };
}

function buildHost(room: Room): HostPanel {
  const g = room.game;
  const secrets = !room.settings.hostPlays;
  const nightSubmitted: Record<string, boolean> = {};
  const voteSubmitted: Record<string, boolean> = {};
  if (g?.phase === 'night' || g?.phase === 'prenight') {
    for (const p of room.players) {
      const opts = nightOptions(room, p.id);
      if (opts.length) nightSubmitted[p.id] = opts.every((o) => !!g.night.actions[`${p.id}:${o.abilityId}`]);
    }
  }
  if (g?.phase === 'voting') for (const p of eligibleVoters(room)) voteSubmitted[p.id] = !!g.day.votes[p.id];
  let alignmentAlive: Record<Alignment, number> | null = null;
  if (g && secrets) {
    alignmentAlive = { good: 0, mafia: 0, evil: 0, neutral: 0 };
    for (const p of room.players) if (p.alive) alignmentAlive[roleAlignment(p.roleId, g.settings)]++;
  }
  return {
    secrets,
    roles: g && secrets ? Object.fromEntries(room.players.map((p) => [p.id, p.roleId ?? ''])) : null,
    nightActions: g && secrets ? Object.values(g.night.actions).filter(() => g.phase === 'night' || g.phase === 'prenight').map(({ actorId, abilityId, targetId }) => ({ actorId, abilityId, targetId })) : null,
    votes: g && secrets && g.phase === 'voting' ? Object.values(g.day.votes).map(({ voterId, targetId, weight }) => ({ voterId, targetId, weight })) : null,
    nightSubmitted,
    voteSubmitted,
    log: secrets ? room.log.slice(-400) : room.log.filter((l) => l.visibility === 'public').slice(-400),
    alignmentAlive,
    winPreview: g && secrets && room.status === 'active' ? checkWin(room) : null,
  };
}

export function buildView(room: Room, viewer: Viewer, connected: Set<string>, now: number): ClientView {
  const base = buildPublic(room, connected, now);
  if (viewer.kind === 'public') return { ...base, me: null, host: null };
  if (viewer.kind === 'player') return { ...base, kind: 'player', me: buildMe(room, viewer.playerId, now), host: null };
  const me = room.hostPlayerId ? buildMe(room, room.hostPlayerId, now) : null;
  return { ...base, kind: 'host', me, host: buildHost(room) };
}

/** FNV-1a: a cheap, stable hash for shuffling the anonymous Mafia slots each night. */
function slotHash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
