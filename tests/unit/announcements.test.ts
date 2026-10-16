import { describe, expect, it } from 'vitest';
import { hostAnnounce, submitNightAction, submitVote } from '../../src/shared/engine';
import { buildPublic } from '../../src/server/views';
import { setup } from './helpers';

/**
 * Regression tests for the announcement glitches seen in a live game:
 * duplicated lines, repetitive phase chatter, and news that didn't match the phase.
 */
const V = 'villager';
const news = (g: ReturnType<typeof setup>) => buildPublic(g.room, new Set(), Date.now()).game!.news.map((n) => n.text);
const publicFeed = (g: ReturnType<typeof setup>) => buildPublic(g.room, new Set(), Date.now()).feed;

describe('announcements', () => {
  it('phase changes are not posted as public announcements (no repetitive chatter)', () => {
    const g = setup(['mafia', V, V, V, V]);
    g.goToNight();
    g.advance();
    g.goToVoting();
    g.advance();
    expect(publicFeed(g).some((l) => l.kind === 'phase')).toBe(false);
    expect(publicFeed(g).map((l) => l.text).join('\n')).not.toMatch(/falls|discuss, then vote|open your panel/);
  });

  it('Day shows exactly what happened last night — once', () => {
    const g = setup(['mafia', 'godfather', V, V, V, V, V]);
    g.goToNight();
    g.act(0, 'mafia_kill', 2);
    g.act(1, 'silence', 3);
    g.advance();
    expect(g.room.game!.phase).toBe('voting');
    expect(news(g)).toEqual(['P2 was killed during the night.', 'P3 has been silenced and cannot speak today (they can still vote).']);
  });

  it('the vote result is shown at the next Night when there is no Dawn round (was missing)', () => {
    const g = setup(['mafia', V, V, V, V, V]);
    g.goToVoting();
    for (const i of [0, 1, 2, 3, 4]) g.vote(i, 5);
    g.advance();
    expect(g.room.game!.phase).toBe('night');
    expect(news(g)).toEqual(['The town has eliminated P5.']);
  });

  it('with a Dawn round: Dawn shows the vote result, Night shows what happened at Dawn', () => {
    const g = setup(['mafia', 'thief', 'detective', V, V, V, V]);
    g.goToVoting();
    for (const i of [0, 1, 2, 3, 4, 5]) g.vote(i, 6);
    g.advance();
    expect(g.room.game!.phase).toBe('prenight');
    expect(news(g)).toEqual(['The town has eliminated P6.']);
    submitNightAction(g.room, 'p1', { abilityId: 'steal', targetId: 'investigate', phaseSeq: g.seq() }, Date.now());
    g.advance();
    expect(g.room.game!.phase).toBe('night');
    expect(news(g)).toEqual(['At dawn, the Thief struck — someone’s power was stolen for this round.']);
  });

  it('a runoff is announced once, not twice', () => {
    const g = setup(['mafia', V, V, V, V], { tieRule: 'runoff' });
    g.goToVoting();
    g.vote(0, 1);
    g.vote(1, 0);
    g.vote(2, 1);
    g.vote(3, 0);
    g.advance();
    expect(g.room.game!.day.runoff).not.toBeNull();
    const runoffLines = publicFeed(g).filter((l) => /runoff/i.test(l.text));
    expect(runoffLines).toHaveLength(1);
    expect(news(g)).toHaveLength(1);
    expect(news(g)[0]).toMatch(/^It's a tie between (P0 and P1|P1 and P0)\. A runoff vote begins\.$/);
  });

  it('a Game Master announcement during the night reaches everyone in the next news', () => {
    const g = setup(['mafia', V, V, V, V]);
    g.goToNight();
    hostAnnounce(g.room, 'Five-minute break after this round', Date.now());
    g.advance();
    expect(news(g)).toContain('📣 Five-minute break after this round');
  });

  it('Mafia and the Thief hitting the same person: one death, one announcement', () => {
    const g = setup(['mafia', 'mafia', 'thief', V, V, V, V, V, V]);
    while (g.room.game!.phase !== 'prenight') g.advance();
    submitNightAction(g.room, 'p2', { abilityId: 'steal', targetId: 'mafia_kill', phaseSeq: g.seq() }, Date.now());
    g.advance();
    const robbed = g.room.players.find((p) => p.lostAbilities.includes('mafia_kill'))!;
    g.act(robbed.id === 'p0' ? 1 : 0, 'mafia_kill', 4); // the remaining Mafia
    g.act(2, 'mafia_kill', 4); // the Thief, same victim
    g.advance();
    expect(news(g)).toEqual(['P4 was killed during the night.']);
    expect(g.room.game!.stats.nightKills).toBe(1);
  });

  it('news is never carried over into the following phase', () => {
    const g = setup(['mafia', V, V, V, V]);
    g.goToNight();
    g.act(0, 'mafia_kill', 1);
    g.advance(); // Day: night news
    for (const i of [0, 2, 3, 4]) g.vote(i, null);
    g.advance(); // Night 2: only the vote result, not last night's death again
    expect(news(g)).toEqual(['The town could not agree. Nobody was eliminated.']);
  });
});


describe('event tags for sound design', () => {
  it('tags kills, votes and the final result (the text is host-editable, so sounds use tags)', () => {
    const g = setup(['mafia', 'villager', 'villager', 'villager', 'doctor']);
    g.goToNight();
    g.act(0, 'mafia_kill', 1);
    g.advance();
    const tags = () => g.room.log.filter((l) => l.tag).map((l) => l.tag);
    expect(tags()).toContain('kill');
    for (const p of g.room.players.filter((x) => x.alive && x.id !== 'p0')) submitVote(g.room, p.id, { targetId: 'p0', phaseSeq: g.seq() }, 1);
    g.advance();
    expect(tags()).toContain('voteout');
    expect(tags()).toContain('win-town');
  });

  it('a quiet night and a quiet dawn are tagged too', () => {
    const g = setup(['mafia', 'villager', 'villager', 'villager', 'doctor']);
    g.goToNight();
    g.act(0, 'mafia_kill', null);
    g.advance();
    expect(g.room.log.filter((l) => l.tag).map((l) => l.tag)).toContain('quiet');
  });
});
