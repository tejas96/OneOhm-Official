import { TASK_PRIORITIES, WAITING_PARTIES } from '@oneohm/domain';
import { z } from 'zod';
import { instantSchema } from '../common/primitives';
import { userRefSchema } from './crm.schema';

/** Set by a manager (spec 3.3); `none` lets the automatic order decide. */
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export const setTaskPriorityInputSchema = z.object({ priority: taskPrioritySchema });
export type SetTaskPriorityInput = z.infer<typeof setTaskPriorityInputSchema>;

/** An earlier task a task waits for: who holds it, how late, or the outside party. */
export const taskBlockerSchema = z.object({
  title: z.string(),
  assignee: z.string().nullable(),
  daysLate: z.number().int(),
  waitingOn: z.enum(WAITING_PARTIES).nullable(),
});

/**
 * What helps a person own a task (spec 3.3–3.5): what it blocks and waits for, its
 * priority, and whether it has gone stale. Spread into the task schema.
 */
export const taskOwnershipShape = {
  /** Open tasks that wait for this one to finish. */
  blocking: z.array(z.string()),
  /** Earlier tasks this one waits for: who holds each, how late, or the outside party. */
  blockers: z.array(taskBlockerSchema),
  priority: taskPrioritySchema,
  prioritySetBy: userRefSchema.nullable(),
  /** Finishing it makes a payment milestone due. */
  unlocksPayment: z.boolean(),
  /** An open task waiting on this one is Urgent. */
  blocksUrgent: z.boolean(),
  /** Ready or in progress with no update for the days set in Settings (spec 3.5). */
  stale: z.boolean(),
  lastUpdateAt: instantSchema,
  /** Days since then, leave not counted: the same count the morning summary uses. */
  idleDays: z.number().int(),
};
