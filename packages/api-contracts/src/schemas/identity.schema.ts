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
