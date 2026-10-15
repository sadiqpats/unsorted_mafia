import type { Settings } from './settings';
import type { Alignment } from './types';

/**
 * DATA-DRIVEN CHARACTER SYSTEM
 * ----------------------------
 * Abilities and roles are plain data. The engine (engine.ts) looks abilities
 * up by id and runs the matching resolver from NIGHT_RESOLVERS in priority
 * order. To add a character see docs/ADDING_ROLES.md.
 */

export type TargetRule =
  | 'alive-other' // any living player except yourself
  | 'alive-any' // any living player (self allowed)
  | 'alive-non-mafia' // living players outside the Mafia team
  | 'dead' // eliminated players
  | 'self'; // only yourself

export interface AbilityDef {
  id: string;
  name: string;
  /** night: chosen during the night. vote: modifies your day vote. passive: always on. */
  kind: 'night' | 'vote' | 'passive';
  /** Lower resolves first. Documented in docs/RULES.md#resolution-order */
  priority: number;
  /** Team abilities (Mafia kill) are decided collectively. */
  team?: boolean;
  /** Can a Thief steal it? */
  transferable: boolean;
  target: TargetRule;
  /** Charges at game start. null = unlimited. */
  charges: (s: Settings) => number | null;
  /** Short prompt shown in the private action panel. */
  prompt: string;
  description: string;
  /** With the pre-night round on, this ability is used 'Before Nightfall' instead of at night. */
  preNight?: boolean;
  /** Can this be used while silenced? (Silence only restricts the day; night abilities default to true.) */
  usableWhenSilenced: boolean;
}

export const ABILITIES: Record<string, AbilityDef> = {
  mafia_kill: {
    id: 'mafia_kill',
    name: 'Mafia Hit',
    kind: 'night',
    priority: 50,
    team: true,
    transferable: false,
    target: 'alive-non-mafia',
    charges: () => null,
    prompt: 'Vote with your family: who gets hit tonight?',
    description: 'The Mafia team chooses one player to eliminate each night.',
    usableWhenSilenced: true,
  },
  silence: {
    id: 'silence',
    name: 'Silence',
    kind: 'night',
    priority: 20,
    transferable: true,
    target: 'alive-other',
    charges: () => null,
    prompt: 'Who will you silence for tomorrow?',
    description: 'The target cannot speak or vote during the next day.',
    usableWhenSilenced: true,
  },
  investigate: {
    id: 'investigate',
    name: 'Investigate',
    kind: 'night',
    priority: 80,
    transferable: true,
    target: 'alive-other',
    charges: () => null,
    prompt: 'Who will you investigate tonight?',
    description: 'Privately learn whether a player is suspicious.',
    usableWhenSilenced: true,
  },
  protect: {
    id: 'protect',
    name: 'Protect',
    kind: 'night',
    priority: 10,
    transferable: true,
    target: 'alive-any',
    charges: () => null,
    prompt: 'Who will you protect tonight?',
    description: 'Your target survives a night attack.',
    usableWhenSilenced: true,
  },
  guard: {
    id: 'guard',
    name: 'Bodyguard',
    kind: 'night',
    priority: 10,
    transferable: true,
    target: 'alive-any',
    charges: (s) => s.bodyguardCharges,
    prompt: 'Spend your protection on someone tonight? (limited)',
    description: 'Shield one player from a night attack. Limited uses.',
    usableWhenSilenced: true,
  },
  steal: {
    id: 'steal',
    name: 'Steal',
    kind: 'night',
    priority: 95,
    transferable: false,
    target: 'alive-other',
    charges: (s) => s.thiefCharges,
    preNight: true,
    prompt: 'Whose ability will you steal?',
    description: "Steal another player's ability and take over their job.",
    usableWhenSilenced: true,
  },
  revive: {
    id: 'revive',
    name: 'Revive',
    kind: 'night',
    priority: 90,
    transferable: true,
    target: 'dead',
    charges: (s) => s.priestCharges,
    prompt: 'Bring someone back from the dead?',
    description: 'Return an eliminated player to the game. Limited uses.',
    usableWhenSilenced: true,
  },
  imposter_revive: {
    id: 'imposter_revive',
    name: 'Resurrect',
    kind: 'night',
    priority: 90,
    preNight: true,
    transferable: false,
    target: 'dead',
    charges: (s) => (s.imposterCharges === 0 ? null : s.imposterCharges),
    prompt: 'Bring someone back from the dead before nightfall — or skip.',
    description: 'Before nightfall, return any eliminated player to the game.',
    usableWhenSilenced: true,
  },
  judge_vote: {
    id: 'judge_vote',
    name: 'Weighted Vote',
    kind: 'passive',
    priority: 0,
    transferable: true,
    target: 'self',
    charges: () => null,
    prompt: '',
    description: 'Your day vote counts extra (default ×2). Applied by the server.',
    usableWhenSilenced: false,
  },
  // ---- Villager optional powers (OFF by default — proposed suggestions) ----
  v_hunch: {
    id: 'v_hunch',
    name: 'Hunch',
    kind: 'night',
    priority: 80,
    transferable: true,
    target: 'alive-other',
    charges: () => 1,
    prompt: 'Once per game: learn whether a player has a night power.',
    description: 'Optional villager power. Once per game, learn if a player has any night ability.',
    usableWhenSilenced: true,
  },
  v_shield: {
    id: 'v_shield',
    name: 'Barricade',
    kind: 'night',
    priority: 10,
    transferable: true,
    target: 'self',
    charges: () => 1,
    prompt: 'Once per game: barricade your door tonight?',
    description: 'Optional villager power. Once per game, protect yourself for one night.',
    usableWhenSilenced: true,
  },
  v_rally: {
    id: 'v_rally',
    name: 'Rally',
    kind: 'vote',
    priority: 0,
    transferable: true,
    target: 'self',
    charges: () => 1,
    prompt: 'Once per game: make this vote count double.',
    description: 'Optional villager power. Once per game, your day vote counts double.',
    usableWhenSilenced: false,
  },
};

export interface RoleDef {
  id: string;
  name: string;
  alignment: (s: Settings) => Alignment;
  /** Member of the Mafia team (sees teammates, joins the hit). */
  mafiaTeam: (s: Settings) => boolean;
  unique: boolean;
  tagline: string;
  description: string;
  abilityText: string;
  howTo: string;
  winCondition: string;
  /** Abilities this role holds. `enabled` lets settings switch an ability on/off for the role. */
  abilities: { id: string; enabled?: (s: Settings) => boolean }[];
  /** Survivor-style neutrals co-win with whoever wins if they are alive at the end. */
  winsBySurviving?: boolean;
  /** What a Detective sees. Defaults to the role's alignment. */
  investigatesAs?: (s: Settings) => Alignment;
  art: string;
}

const fixed = (a: Alignment) => () => a;

export const ROLES: Record<string, RoleDef> = {
  mafia: {
    id: 'mafia',
    name: 'Mafia',
    alignment: fixed('mafia'),
    mafiaTeam: () => true,
    unique: false,
    tagline: 'Family first. Witnesses last.',
    description: 'A made member of the family. You know your fellow Mafia and hunt together after dark.',
    abilityText: 'Each night, vote with the Mafia on one player to eliminate.',
    howTo: 'At night, open your secret panel and pick a target. Your teammates see your pick. The family decision follows the room rule (default: most votes; ties go to the Godfather).',
    winCondition: 'Win when the Mafia equal or outnumber everyone else still alive.',
    abilities: [{ id: 'mafia_kill' }],
    art: 'fedora',
  },
  godfather: {
    id: 'godfather',
    name: 'Godfather',
    alignment: fixed('mafia'),
    mafiaTeam: () => true,
    unique: true,
    tagline: 'A whisper is louder than a gunshot.',
    description: 'Head of the family. You decide who keeps quiet tomorrow.',
    abilityText: 'Each night, silence one player for the next day. You also join the Mafia hit (configurable) and break its ties.',
    howTo: 'At night, choose who to silence. A silenced player cannot speak or vote the next day and is never told who did it.',
    winCondition: 'Win with the Mafia.',
    abilities: [{ id: 'silence' }, { id: 'mafia_kill', enabled: (s) => s.godfatherJoinsKill }],
    investigatesAs: (s) => (s.godfatherAppearsInnocent ? 'good' : 'mafia'),
    art: 'rose',
  },
  detective: {
    id: 'detective',
    name: 'Detective',
    alignment: fixed('good'),
    mafiaTeam: () => false,
    unique: true,
    tagline: 'Everyone lies. The evidence doesn’t.',
    description: 'A sharp-eyed investigator working the case from the inside.',
    abilityText: 'Each night, investigate one player and privately learn if they are suspicious.',
    howTo: 'At night, pick someone to investigate. Your result appears in your private notebook at dawn. Nobody else ever sees it — share it (or don’t) by talking.',
    winCondition: 'Win when every Mafia member is eliminated.',
    abilities: [{ id: 'investigate' }],
    art: 'lens',
  },
  doctor: {
    id: 'doctor',
    name: 'Doctor',
    alignment: fixed('good'),
    mafiaTeam: () => false,
    unique: true,
    tagline: 'Not tonight.',
    description: 'You patch up the town, one late-night house call at a time.',
    abilityText: 'Each night, protect one player from being killed.',
    howTo: 'At night, choose who to protect. If the Mafia hit that player, they survive. Self-protection depends on the house rules.',
    winCondition: 'Win when every Mafia member is eliminated.',
    abilities: [{ id: 'protect' }],
    art: 'cross',
  },
  bodyguard: {
    id: 'bodyguard',
    name: 'Bodyguard',
    alignment: fixed('good'),
    mafiaTeam: () => false,
    unique: true,
    tagline: 'One shot at being a hero.',
    description: 'A professional protector with a single perfect save in them.',
    abilityText: 'Once per game (configurable), shield one player from a night attack.',
    howTo: 'At night you may spend your protection, or skip to save it for later. Once it is used up, it is gone.',
    winCondition: 'Win when every Mafia member is eliminated.',
    abilities: [{ id: 'guard' }],
    art: 'shield',
  },
  judge: {
    id: 'judge',
    name: 'Judge',
    alignment: fixed('good'),
    mafiaTeam: () => false,
    unique: true,
    tagline: 'Order in the court.',
    description: 'The voice of law in a lawless town.',
    abilityText: 'Your day vote counts double (configurable). The server applies the weight — you still vote once.',
    howTo: 'Vote like everyone else during the day. Your vote is automatically weighted when the tally is counted.',
    winCondition: 'Win when every Mafia member is eliminated.',
    abilities: [{ id: 'judge_vote' }],
    art: 'gavel',
  },
  villager: {
    id: 'villager',
    name: 'Villager',
    alignment: fixed('good'),
    mafiaTeam: () => false,
    unique: false,
    tagline: 'Plans worth showing up for.',
    description: 'An ordinary guest with extraordinary instincts. Your weapon is your read on people.',
    abilityText: 'No night power by default — you win through discussion, deduction and your vote. The host may enable optional powers.',
    howTo: 'At night you still choose a player you suspect (it keeps everyone tapping, so nobody can tell who has a power). By day, argue, read the room, and vote.',
    winCondition: 'Win when every Mafia member is eliminated.',
    abilities: [
      { id: 'v_hunch', enabled: (s) => s.villagerPowers.hunch },
      { id: 'v_shield', enabled: (s) => s.villagerPowers.shield },
      { id: 'v_rally', enabled: (s) => s.villagerPowers.rally },
    ],
    art: 'lantern',
  },
  thief: {
    id: 'thief',
    name: 'Thief',
    alignment: (s) => s.thiefAlignment,
    mafiaTeam: () => false,
    unique: true,
    tagline: 'What’s yours is mine.',
    description: 'A light-fingered opportunist who borrows other people’s talents.',
    abilityText: 'Before nightfall, steal another player’s power and take over their job. They are left playing as a Villager. Exact rules are set by the host.',
    howTo: 'In the “Before Nightfall” round, pick someone to rob. If they have a power you can take, it is yours from that night on and they lose it. Some powers (the Mafia hit, win conditions) cannot be stolen.',
    winCondition: 'Neutral: win by surviving to the end of the game (alongside whoever wins).',
    abilities: [{ id: 'steal' }],
    winsBySurviving: true,
    art: 'mask',
  },
  priest: {
    id: 'priest',
    name: 'Priest',
    alignment: fixed('neutral'),
    mafiaTeam: () => false,
    unique: true,
    tagline: 'Not everyone stays buried.',
    description: 'A keeper of candles with a few miracles left to give.',
    abilityText: 'At night, revive an eliminated player. Limited charges (default 2).',
    howTo: 'When someone is dead, your panel lets you choose them. If the revival succeeds, the whole town is told they are back.',
    winCondition: 'Neutral: win by surviving to the end of the game (alongside whoever wins).',
    abilities: [{ id: 'revive' }],
    winsBySurviving: true,
    art: 'candle',
  },
  imposter: {
    id: 'imposter',
    name: 'Imposter',
    alignment: (s) => s.imposterAlignment,
    mafiaTeam: () => false,
    unique: true,
    tagline: 'Death is just a costume change.',
    description: 'Nobody is quite sure who you really are — or how you keep bringing people back.',
    abilityText: 'Before nightfall, revive anyone who has been eliminated — or skip. Default: wins with the Mafia (without knowing who they are).',
    howTo: 'In the “Before Nightfall” round, pick a dead player to bring back, or skip. Choose wisely: reviving the wrong person can lose you the game.',
    winCondition: 'Default: win with the Mafia (the host can change your side).',
    abilities: [{ id: 'imposter_revive' }],
    art: 'imposter',
  },
  jester: {
    id: 'jester',
    name: 'Jester',
    alignment: fixed('neutral'),
    mafiaTeam: () => false,
    unique: true,
    tagline: 'The joke is on all of you.',
    description: 'A chaos agent who craves the spotlight — especially the gallows.',
    abilityText: 'You win personally if the town votes you out during the day. Dying at night does not count.',
    howTo: 'Act suspicious enough to be voted out — but not so obviously that the town catches on.',
    winCondition: 'Neutral: win alone if eliminated by a day vote.',
    abilities: [],
    art: 'jester',
  },
};

export const ROLE_ORDER = [
  'mafia',
  'godfather',
  'detective',
  'doctor',
  'bodyguard',
  'judge',
  'villager',
  'thief',
  'priest',
  'imposter',
  'jester',
];

export function roleAlignment(roleId: string | null, s: Settings): Alignment {
  if (!roleId) return 'good';
  return ROLES[roleId]?.alignment(s) ?? 'good';
}

export function isMafiaTeam(roleId: string | null, s: Settings): boolean {
  if (!roleId) return false;
  return ROLES[roleId]?.mafiaTeam(s) ?? false;
}

export const ALIGNMENT_LABEL: Record<Alignment, string> = {
  good: 'Town (Good)',
  mafia: 'Mafia',
  neutral: 'Neutral',
};
