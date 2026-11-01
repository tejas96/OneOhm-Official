import { TASK_REVIEWERS } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema } from '../common/primitives';
import { userRefSchema } from './crm.schema';

export const taskReviewerSchema = z.enum(TASK_REVIEWERS);

/** Work sent back for correction: why, by whom and when (PRD 4.4). */
export const taskReturnSchema = z.object({
  note: z.string(),
  by: userRefSchema.nullable(),
  at: instantSchema,
});
export type TaskReturn = z.infer<typeof taskReturnSchema>;

/** One line of the project's history as a task screen shows it. */
export const taskActivitySchema = z.object({
  id: idSchema,
  kind: z.string(),
  message: z.string(),
  user: userRefSchema.nullable(),
  /** The task it is about, if any, and whether that is the task being viewed. */
  taskId: idSchema.nullable(),
  createdAt: instantSchema,
});
export type TaskActivity = z.infer<typeof taskActivitySchema>;

const reasonSchema = z
  .string()
  .trim()
  .min(3, 'Write a short reason.')
  .max(500, 'Keep it under 500 characters.');

export const rescheduleTaskInputSchema = z.object({
  dueDate: calendarDateSchema,
  reason: reasonSchema,
});
export type RescheduleTaskInput = z.infer<typeof rescheduleTaskInputSchema>;

export const returnTaskInputSchema = z.object({ reason: reasonSchema });

export const taskUpdateInputSchema = z.object({
  note: z.string().trim().min(2, 'Write what changed.').max(1000, 'Keep it under 1000 characters.'),
});
