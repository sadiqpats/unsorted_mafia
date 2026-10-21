import { z } from 'zod';
import { SettingsPatchSchema } from './settings';

/**
 * Every command a client can send over the socket. The server validates the
 * shape with Zod, then checks identity, permissions, phase and eligibility in
 * the engine. `actionId` is an idempotency key: retrying the same command
 * (e.g. after a flaky connection) is answered without being applied twice.
 */
const id = z.string().min(1).max(64);
const actionId = z.string().min(8).max(64);
const base = { actionId };

export const PlayerCommandSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('ready'), ready: z.boolean() }),
  z.object({ ...base, type: z.literal('ack_role') }),
  z.object({ ...base, type: z.literal('night_action'), abilityId: id, targetId: id.nullable(), phaseSeq: z.number().int() }),
  z.object({ ...base, type: z.literal('vote'), targetId: id.nullable(), rally: z.boolean().optional(), phaseSeq: z.number().int() }),
]);

export const HostCommandSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('update_settings'), patch: SettingsPatchSchema }),
  z.object({ ...base, type: z.literal('set_host_plays'), hostPlays: z.boolean() }),
  z.object({ ...base, type: z.literal('kick'), playerId: id }),
  z.object({ ...base, type: z.literal('start'), force: z.boolean().optional() }),
  z.object({ ...base, type: z.literal('start_trial') }),
  z.object({ ...base, type: z.literal('advance'), phaseSeq: z.number().int() }),
  z.object({ ...base, type: z.literal('pause') }),
  z.object({ ...base, type: z.literal('resume') }),
  z.object({ ...base, type: z.literal('extend'), seconds: z.number().int().min(-600).max(1800) }),
  z.object({ ...base, type: z.literal('eliminate'), playerId: id }),
  z.object({ ...base, type: z.literal('restore'), playerId: id }),
  z.object({ ...base, type: z.literal('resolve_tie'), targetId: id.nullable() }),
  z.object({ ...base, type: z.literal('end_game') }),
  z.object({ ...base, type: z.literal('restart') }),
  z.object({ ...base, type: z.literal('close_room') }),
  z.object({ ...base, type: z.literal('announce'), text: z.string().min(1).max(240) }),
  z.object({ ...base, type: z.literal('set_volume'), musicVolume: z.number().int().min(0).max(100).optional(), sfxVolume: z.number().int().min(0).max(100).optional() }),
  z.object({ ...base, type: z.literal('issue_rejoin'), playerId: id }),
  z.object({ ...base, type: z.literal('remove_photo'), playerId: id }),
]);

export type PlayerCommand = z.infer<typeof PlayerCommandSchema>;
export type HostCommand = z.infer<typeof HostCommandSchema>;
export type Command = PlayerCommand | HostCommand;
export type CommandInput = Command extends infer C ? (C extends unknown ? Omit<C, 'actionId'> : never) : never;

export const PLAYER_COMMANDS = new Set(PlayerCommandSchema.options.map((o) => o.shape.type.value));
export const HOST_COMMANDS = new Set(HostCommandSchema.options.map((o) => o.shape.type.value));

export interface Ack {
  ok: boolean;
  error?: { code: string; message: string };
  data?: Record<string, unknown>;
  duplicate?: boolean;
}
