import { z } from 'zod';
import { idSchema, instantSchema } from '../common/primitives';

/** One recorded action: who did what to which record, and when (PRD 7.3). */
export const auditEntrySchema = z.object({
  id: idSchema,
  at: instantSchema,
  actor: z.object({ id: idSchema, name: z.string() }).nullable(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string(),
  data: z.record(z.string(), z.unknown()).nullable(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditPageSchema = z.object({
  items: z.array(auditEntrySchema),
  /** Pass as `before` for the next, older page; null at the end. */
  next: instantSchema.nullable(),
  /** Pass as `cursor` for the next, older page (preferred over `before`); null at the end. */
  cursor: z.string().nullable(),
});

export const signInAttemptSchema = z.object({
  id: idSchema,
  at: instantSchema,
  identifier: z.string(),
  method: z.string(),
  ip: z.string().nullable(),
  user: z.object({ id: idSchema, name: z.string() }).nullable(),
  success: z.boolean(),
});
export type SignInAttempt = z.infer<typeof signInAttemptSchema>;
