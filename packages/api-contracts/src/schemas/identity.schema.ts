import { CAPABILITIES, ROLE_KINDS } from '@oneohm/domain';
import { z } from 'zod';
import { idSchema } from '../common/primitives';

export const capabilitySchema = z.enum(CAPABILITIES);
export const roleKindSchema = z.enum(ROLE_KINDS);

export const roleRefSchema = z.object({
  id: idSchema,
  key: z.string(),
  name: z.string(),
  kind: roleKindSchema,
});

export const currentUserSchema = z.object({
  id: idSchema,
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  /** The broadest kind among the person's roles: staff > partner > reseller. */
  kind: roleKindSchema,
  roles: z.array(roleRefSchema),
  capabilities: z.array(capabilitySchema),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const personSchema = z.object({
  id: idSchema,
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  employeeCode: z.string().nullable(),
  designation: z.string().nullable(),
  status: z.enum(['active', 'inactive']),
  onLeave: z.boolean(),
  roles: z.array(roleRefSchema),
  /** Skill keys the person holds (PRD 3.7). */
  skills: z.array(z.string()),
  openTasks: z.number().int(),
  /** Workload (PRD 3.12): the limit that applies (own or company default), null for none. */
  openTaskLimit: z.number().int().nullable(),
  /** The person's own limit, over the company default. */
  personalTaskLimit: z.number().int().nullable(),
  loadState: z.enum(['ok', 'full', 'over']),
  /** Location for this person over their roles and the company: on, off, or null to follow. */
  tracking: z.enum(['on', 'off']).nullable(),
  /** Who the person reports to (PRD 3.12); null for no one. */
  reportsTo: z.object({ id: idSchema, fullName: z.string() }).nullable(),
  /** Whether they have signed in yet (last_active_at is set on the first sign-in). */
  invite: z.enum(['not_signed_in', 'signed_in']),
  /** What happened to the newest WhatsApp invite; null when none was queued. */
  inviteDelivery: z.enum(['sent', 'failed', 'queued']).nullable(),
  /** The invite sentence to copy, only while they have not signed in. */
  inviteText: z.string().nullable(),
  /** The day they left the team; null for current members. */
  leftOn: z.string().nullable(),
});
export type Person = z.infer<typeof personSchema>;

export const roleSchema = z.object({
  id: idSchema,
  key: z.string(),
  name: z.string(),
  kind: roleKindSchema,
  description: z.string(),
  system: z.boolean(),
  archived: z.boolean(),
  capabilities: z.array(capabilitySchema),
  memberCount: z.number().int(),
});
export type Role = z.infer<typeof roleSchema>;
