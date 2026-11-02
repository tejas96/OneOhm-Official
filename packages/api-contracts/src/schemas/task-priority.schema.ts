import { TASK_PRIORITIES, WAITING_PARTIES } from '@oneohm/domain';
import { z } from 'zod';

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
