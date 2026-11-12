import { isMafiaTeam } from './roles';
import type { Room } from './types';

/** End-of-game awards, worked out once the game is over (every role is public by then). */
export interface Award {
  key: 'suspect' | 'eye' | 'escape' | 'guardian';
  emoji: string;
  title: string;
  playerId: string;
  detail: string;
}

const top = (m: Record<string, number> | undefined) => Object.entries(m ?? {}).sort((a, b) => b[1] - a[1])[0];

export function computeAwards(room: Room): Award[] {
  const g = room.game;
  if (!g) return [];
  const s = g.settings;
  const has = (id: string) => room.players.some((p) => p.id === id);
  const out: Award[] = [];
  const suspect = top(g.stats.votesAgainst);
  if (suspect && suspect[1] >= 2 && has(suspect[0])) out.push({ key: 'suspect', emoji: '🎯', title: 'Most suspected', playerId: suspect[0], detail: `${suspect[1]} votes against them` });
  const eye = top(g.stats.mafiaVotes);
  if (eye && eye[1] >= 2 && has(eye[0])) out.push({ key: 'eye', emoji: '🦅', title: 'Sharpest eye', playerId: eye[0], detail: `Voted for the Mafia ${eye[1]} times` });
  // The Mafia member who lasted longest (alive at the end beats any death; later death beats earlier).
  const mafia = room.players.filter((p) => isMafiaTeam(p.roleId, s));
  if (mafia.length > 1 && g.round >= 2) {
    const lasted = (p: (typeof mafia)[number]) => (p.alive ? Infinity : (p.deathRound ?? 0));
    const best = [...mafia].sort((a, b) => lasted(b) - lasted(a));
    if (lasted(best[0]) > lasted(best[1])) out.push({ key: 'escape', emoji: '🎭', title: 'Best liar', playerId: best[0].id, detail: best[0].alive ? 'Never caught' : `Fooled the town until round ${best[0].deathRound}` });
  }
  const doc = room.players.find((p) => p.roleId === 'doctor');
  if (doc && g.stats.saves > 0) out.push({ key: 'guardian', emoji: '🩺', title: 'Life saver', playerId: doc.id, detail: g.stats.saves === 1 ? 'Saved a life' : `Saved ${g.stats.saves} lives` });
  return out;
}
