import { z } from 'zod';
import { calendarDateSchema, idSchema } from '../common/primitives';

/**
 * What a window of leave touches (PRD 4.6, Flow E): open tasks that are already late,
 * due inside it or running through it; service requests the person holds; and lead
 * follow-ups due by its end. All of it goes to the backup when the leave is approved.
 */
/** One other person's leave that clashes with a request (a warning, never a block). */
export const leaveClashItemSchema = z.object({
  user: z.object({ id: idSchema, fullName: z.string() }),
  fromDate: calendarDateSchema,
  toDate: calendarDateSchema,
  status: z.enum(['pending', 'approved']),
});
export type LeaveClashItem = z.infer<typeof leaveClashItemSchema>;

export const leaveClashesSchema = z.object({
  /** The named backup is away (leave pending or approved) on some of these days. */
  backupAway: z.array(leaveClashItemSchema).default([]),
  /** The person asking is the backup for these people's leave, on some of these days. */
  covering: z.array(leaveClashItemSchema).default([]),
});
export type LeaveClashes = z.infer<typeof leaveClashesSchema>;

export const leaveImpactSchema = z.object({
  halfDays: z.number().int(),
  /** What is left of this kind of leave if this request is approved. */
  balanceAfterHalfDays: z.number().int(),
  overlapsExisting: z.boolean(),
  clashes: leaveClashesSchema.default({ backupAway: [], covering: [] }),
  /** Open tasks that fall due inside the leave dates. */
  dueInWindow: z.number().int().default(0),
  tasks: z.array(
    z.object({
      id: idSchema,
      title: z.string(),
      projectCode: z.string(),
      dueDate: calendarDateSchema,
      customerVisible: z.boolean(),
      /** Already late, due inside the leave, or running through it. */
      reason: z.enum(['overdue', 'due', 'spans']).optional(),
    }),
  ),
  serviceRequests: z
    .array(z.object({ id: idSchema, title: z.string(), customerName: z.string() }))
    .default([]),
  followUps: z
    .array(z.object({ id: idSchema, name: z.string(), nextActionOn: calendarDateSchema }))
    .default([]),
  /** Projects whose work is affected, with their managers (told on approval). */
  projectCodes: z.array(z.string()).default([]),
  backups: z.array(z.object({ id: idSchema, fullName: z.string(), openTasks: z.number().int() })),
});
export type LeaveImpact = z.infer<typeof leaveImpactSchema>;
