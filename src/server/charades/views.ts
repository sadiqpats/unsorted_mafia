import { winnerOf } from '../../shared/charades/engine';
import { wordCount } from '../../shared/charades/movie';
import type { Card, CardView, CRoom, CView, TeamIdx } from '../../shared/charades/types';

export type CViewer = { kind: 'host' } | { kind: 'captain'; team: TeamIdx } | { kind: 'tv' };

const cardView = (c: Card): CardView => ({ title: c.title, year: c.year || null, genre: c.genre, leads: c.leads, words: wordCount(c.title), source: c.source, verified: c.verified });

/**
 * Who may see the movie:
 * - the host (the judge) always;
 * - the acting captain once they flip the card;
 * - the rival captain in "rival picks" mode (they chose it);
 * - everyone (TV included) once the turn is over.
 */
function canSeeCard(room: CRoom, v: CViewer): boolean {
  const t = room.turn;
  if (!t?.card) return false;
  if (t.stage === 'done' || v.kind === 'host') return true;
  if (v.kind !== 'captain') return false;
  if (v.team === t.team) return t.stage === 'acting';
  return room.settings.picker === 'rival' && ['ready', 'acting'].includes(t.stage) && t.card.source !== 'deck';
}

export function buildCView(room: CRoom, v: CViewer, online: Set<string>, now: number): CView {
  const t = room.turn;
  const showWords = !!t?.card && room.settings.showWordCount && (t.stage === 'acting' || t.stage === 'done');
  return {
    code: room.code,
    status: room.status,
    hostName: room.hostName,
    serverNow: now,
    seq: room.seq,
    settings: room.settings,
    teams: room.teams.map((tm) => ({ name: tm.name, score: tm.score, captain: tm.captain ? { name: tm.captain.name, online: online.has(tm.captain.id) } : null })),
    turn: t
      ? {
          n: t.n,
          round: t.round,
          team: t.team,
          stage: t.stage,
          endsAt: t.endsAt,
          pausedLeft: t.pausedLeft,
          swapsLeft: t.swapsLeft,
          result: t.result,
          tookMs: t.tookMs,
          words: showWords ? wordCount(t.card!.title) : null,
          card: canSeeCard(room, v) ? cardView(t.card!) : null,
          checking: !!t.checking,
          pending: v.kind === 'host' ? t.pending : t.pending ? { title: '', reason: '' } : null,
        }
      : null,
    history: room.history,
    winner: room.status === 'over' ? winnerOf(room) : null,
    me:
      v.kind === 'captain'
        ? { kind: 'captain', team: v.team, name: room.teams[v.team].captain?.name ?? '', rivalNote: t && t.team !== v.team ? t.rivalNote : null }
        : v.kind === 'host'
          ? { kind: 'host' }
          : { kind: 'tv' },
  };
}
