import { isMafiaTeam } from './roles';
import type { Room } from './types';

/** End-of-game awards, worked out once the game is over (every role is public by then). */
export interface Award {
  key: 'eye' | 'suspect' | 'spy' | 'mvp';
  emoji: string;
  title: string;
  playerId: string;
  detail: string;
}

const times = (n: number, one: string, many: string) => (n === 1 ? one : many.replace('#', String(n)));

/** Highest count first; ties go to the earlier seat so the result never flickers between updates. */
function top(room: Room, m: Record<string, number> | undefined) {
  const seat = (id: string) => room.players.find((p) => p.id === id)?.seat ?? 999;
  return Object.entries(m ?? {})
    .filter(([id, n]) => n > 0 && room.players.some((p) => p.id === id))
    .sort((a, b) => b[1] - a[1] || seat(a[0]) - seat(b[0]))[0];
}

/**
 * The four awards revealed at the end, in reveal order: Sharpest eye, Most suspected, Best spy, Best player.
 * An award is skipped only when the game gives nothing to base it on (e.g. no day votes were cast).
 */
export function computeAwards(room: Room): Award[] {
  const g = room.game;
  if (!g) return [];
  const s = g.settings;
  const st = g.stats;
  const out: Award[] = [];

  const eye = top(room, st.mafiaVotes);
  if (eye) out.push({ key: 'eye', emoji: '🦅', title: 'Sharpest eye', playerId: eye[0], detail: times(eye[1], 'Voted for the Mafia once', 'Voted for the Mafia # times') });

  const suspect = top(room, st.votesAgainst);
  if (suspect) out.push({ key: 'suspect', emoji: '🎯', title: 'Most suspected', playerId: suspect[0], detail: times(suspect[1], '1 vote against them', '# votes against them') });

  // Best spy: the Mafia member who fooled the town longest (alive at the end beats any death, a later death beats
  // an earlier one), then the one the town voted against least.
  const mafia = room.players.filter((p) => isMafiaTeam(p.roleId, s));
  if (mafia.length) {
    const lasted = (p: (typeof mafia)[number]) => (p.alive ? Infinity : (p.deathRound ?? 0));
    const against = (id: string) => st.votesAgainst?.[id] ?? 0;
    const spy = [...mafia].sort((a, b) => lasted(b) - lasted(a) || against(a.id) - against(b.id) || a.seat - b.seat)[0];
    const n = against(spy.id);
    const detail = spy.alive ? (n === 0 ? 'Never caught, never suspected' : 'Never caught') : `Fooled the town until round ${spy.deathRound}`;
    out.push({ key: 'spy', emoji: '🕵️', title: 'Best spy', playerId: spy.id, detail });
  }

  // Best player: points for what helped their side, given to someone without another award where possible.
  const winners = new Set(g.winner?.winnerIds ?? []);
  const scored = room.players
    .filter((p) => p.roleId)
    .map((p) => {
      const found = st.mafiaFound?.[p.id] ?? 0;
      const saves = p.roleId === 'doctor' ? st.saves : 0;
      const spotted = st.mafiaVotes?.[p.id] ?? 0;
      const score = (winners.has(p.id) ? 3 : 0) + (p.alive ? 2 : 0) + spotted * 2 + found * 3 + saves * 3;
      const why =
        found > 0 ? times(found, 'Found a Mafia member at night', 'Found # Mafia members at night')
        : saves > 0 ? times(saves, 'Saved a life', 'Saved # lives')
        : spotted > 0 ? times(spotted, 'Voted out the Mafia once', 'Voted for the Mafia # times')
        : p.alive && winners.has(p.id) ? 'Survived and won'
        : winners.has(p.id) ? 'Played for the winning side'
        : 'Kept the table guessing';
      return { p, score, why };
    })
    .sort((a, b) => b.score - a.score || a.p.seat - b.p.seat);
  const taken = new Set(out.map((a) => a.playerId));
  const mvp = scored.find((x) => !taken.has(x.p.id)) ?? scored[0];
  if (mvp) out.push({ key: 'mvp', emoji: '🏆', title: 'Best player', playerId: mvp.p.id, detail: mvp.why });

  return out;
}
