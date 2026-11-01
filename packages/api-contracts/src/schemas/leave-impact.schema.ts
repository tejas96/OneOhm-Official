import { z } from 'zod';
import { calendarDateSchema, idSchema } from '../common/primitives';

/**
 * What a window of leave touches (PRD 4.6, Flow E): open tasks that are already late,
 * due inside it or running through it; service requests the person holds; and lead
 * follow-ups due by its end. All of it goes to the backup when the leave is approved.
 */
export const leaveImpactSchema = z.object({
  halfDays: z.number().int(),
  /** What is left of this kind of leave if this request is approved. */
  balanceAfterHalfDays: z.number().int(),
  overlapsExisting: z.boolean(),
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
