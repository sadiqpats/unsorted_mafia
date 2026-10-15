import { z } from 'zod';

/**
 * Every house rule lives here. Settings are validated with Zod on the server,
 * edited only while the room is in the lobby, and frozen into the game when it
 * starts so rules can never change mid-match.
 */

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 22;

const seconds = (min: number, max: number) => z.number().int().min(min).max(max);

export const AnnouncementsSchema = z.object({
  nightDeath: z.string().min(1).max(160),
  noDeath: z.string().min(1).max(160),
  revived: z.string().min(1).max(160),
  theft: z.string().min(1).max(160),
  quietPreNight: z.string().min(1).max(160),
  silenced: z.string().min(1).max(160),
  voteOut: z.string().min(1).max(160),
  noElimination: z.string().min(1).max(160),
  jesterWin: z.string().min(1).max(160),
});

export const SettingsSchema = z.object({
  playerCount: z.number().int().min(MIN_PLAYERS).max(MAX_PLAYERS),
  /** roleId -> how many copies. Must sum to playerCount. */
  roles: z.record(z.string(), z.number().int().min(0).max(MAX_PLAYERS)),
  /** If true, the host also gets a secret role and the host dashboard hides all secrets. */
  hostPlays: z.boolean(),

  // ---- Timers (seconds) ----
  revealSeconds: seconds(5, 300),
  nightSeconds: seconds(15, 600),
  morningSeconds: seconds(3, 120),
  discussionSeconds: seconds(15, 1800),
  votingSeconds: seconds(10, 600),
  verdictSeconds: seconds(3, 120),
  preNightSeconds: seconds(10, 300),

  // ---- Flow ----
  /** auto: phases advance when the timer runs out. manual: the host presses "Next phase". */
  advanceMode: z.enum(['auto', 'manual']),
  /** End the night as soon as every living player has locked in (everyone must act — see anti-cheat). */
  nightAutoResolve: z.boolean(),
  /** A 'Before Nightfall' round before every night where the Thief steals and the Imposter revives. Runs whenever either role is in the setup, even after they die. */
  preNightRound: z.boolean(),

  // ---- Voting ----
  allowVoteChange: z.boolean(),
  allowSelfVote: z.boolean(),
  allowAbstain: z.boolean(),
  tieRule: z.enum(['none', 'runoff', 'host']),
  /** outcome: only who was eliminated. tally: weighted totals per player. full: who voted for whom. */
  voteReveal: z.enum(['outcome', 'tally', 'full']),

  // ---- Information ----
  revealRoleOnDeath: z.boolean(),
  announceSaves: z.boolean(),
  announceSilenced: z.boolean(),
  deadCanSeeRoles: z.boolean(),
  detectiveResult: z.enum(['alignment', 'binary']),
  godfatherAppearsInnocent: z.boolean(),

  // ---- Mafia ----
  mafiaDecision: z.enum(['plurality', 'leader']),
  godfatherJoinsKill: z.boolean(),
  mafiaWin: z.enum(['parity', 'majority']),

  // ---- Protection ----
  doctorSelfProtect: z.boolean(),
  bodyguardSelfProtect: z.boolean(),
  bodyguardCharges: z.number().int().min(1).max(10),
  bodyguardConsume: z.enum(['onUse', 'onSave']),

  // ---- Priest ----
  priestCharges: z.number().int().min(1).max(10),
  priestAlternateRounds: z.boolean(),
  priestSelfRevive: z.boolean(),
  priestActsWhenDead: z.boolean(),
  revivedKeepRole: z.boolean(),
  revivedKeepEffects: z.boolean(),
  revivedCanActNextPhase: z.boolean(),

  // ---- Thief ----
  thiefAlignment: z.enum(['neutral', 'good', 'mafia']),
  thiefMode: z.enum(['copy', 'take']),
  thiefDuration: z.enum(['oneUse', 'permanent']),
  thiefCharges: z.number().int().min(1).max(10),
  thiefStealPassive: z.boolean(),
  thiefRepeatTarget: z.boolean(),
  /** power: the Thief picks a POWER and never learns whose it was. player: the Thief picks a player. */
  thiefTargetMode: z.enum(['power', 'player']),

  // ---- Imposter ----
  imposterAlignment: z.enum(['mafia', 'neutral', 'good']),
  /** 0 = unlimited revivals */
  imposterCharges: z.number().int().min(0).max(10),

  // ---- Judge ----
  judgeWeight: z.number().int().min(1).max(5),

  // ---- Jester ----
  jesterEndsGame: z.boolean(),

  // ---- Villager optional powers (off by default, max two) ----
  villagerPowers: z.object({
    hunch: z.boolean(),
    shield: z.boolean(),
    rally: z.boolean(),
  }),

  // ---- Room ----
  allowLateJoin: z.boolean(),
  soundDefault: z.boolean(),

  announcements: AnnouncementsSchema,
});

export type Settings = z.infer<typeof SettingsSchema>;
export type Announcements = z.infer<typeof AnnouncementsSchema>;

export const DEFAULT_ANNOUNCEMENTS: Announcements = {
  nightDeath: '{name} was found dead at dawn.',
  noDeath: 'The town wakes. Nobody died tonight.',
  revived: '{name} has returned to the game!',
  theft: 'Before nightfall, the Thief struck — someone’s power was stolen.',
  quietPreNight: 'Nothing stirred before nightfall.',
  silenced: '{name} has been silenced and cannot speak or vote today.',
  voteOut: 'The town has eliminated {name}.',
  noElimination: 'The town could not agree. Nobody was eliminated.',
  jesterWin: '{name} was the Jester — and wanted this all along.',
};

export function defaultSettings(playerCount = 8): Omit<Settings, 'roles'> {
  return {
    playerCount,
    hostPlays: false,
    revealSeconds: 30,
    nightSeconds: 60,
    morningSeconds: 10,
    discussionSeconds: 180,
    votingSeconds: 45,
    verdictSeconds: 10,
    preNightSeconds: 30,
    advanceMode: 'auto',
    nightAutoResolve: true,
    preNightRound: true,
    allowVoteChange: false,
    allowSelfVote: false,
    allowAbstain: true,
    tieRule: 'none',
    voteReveal: 'tally',
    revealRoleOnDeath: true,
    announceSaves: false,
    announceSilenced: true,
    deadCanSeeRoles: false,
    detectiveResult: 'binary',
    godfatherAppearsInnocent: false,
    mafiaDecision: 'plurality',
    godfatherJoinsKill: true,
    mafiaWin: 'parity',
    doctorSelfProtect: false,
    bodyguardSelfProtect: false,
    bodyguardCharges: 1,
    bodyguardConsume: 'onUse',
    priestCharges: 2,
    priestAlternateRounds: false,
    priestSelfRevive: false,
    priestActsWhenDead: false,
    revivedKeepRole: true,
    revivedKeepEffects: false,
    revivedCanActNextPhase: true,
    thiefAlignment: 'neutral',
    thiefMode: 'take',
    thiefDuration: 'permanent',
    thiefCharges: 1,
    thiefStealPassive: true,
    thiefRepeatTarget: false,
    thiefTargetMode: 'power',
    imposterAlignment: 'mafia',
    imposterCharges: 0,
    judgeWeight: 2,
    jesterEndsGame: true,
    villagerPowers: { hunch: false, shield: false, rally: false },
    allowLateJoin: false,
    soundDefault: true,
    announcements: { ...DEFAULT_ANNOUNCEMENTS },
  };
}

/** Partial settings coming from the host UI; deep-merged over current settings, then fully validated. */
export const SettingsPatchSchema = SettingsSchema.partial().extend({
  villagerPowers: SettingsSchema.shape.villagerPowers.partial().optional(),
  announcements: AnnouncementsSchema.partial().optional(),
});
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

export function mergeSettings(current: Settings, patch: SettingsPatch): Settings {
  const merged = {
    ...current,
    ...patch,
    villagerPowers: { ...current.villagerPowers, ...(patch.villagerPowers ?? {}) },
    announcements: { ...current.announcements, ...(patch.announcements ?? {}) },
    roles: patch.roles ? { ...patch.roles } : { ...current.roles },
  };
  return SettingsSchema.parse(merged);
}

export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}
