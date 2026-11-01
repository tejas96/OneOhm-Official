import { z } from 'zod';
import { calendarDateSchema, idSchema } from '../common/primitives';
import { COMMAND_CENTER_PERIODS } from './dashboard.schema';
import {
  epcStageSchema,
  projectTypeSchema,
  taskStatusSchema,
  waitingPartySchema,
} from './project.schema';

/**
 * Which tasks the cross-project list shows: open work, the overdue or unowned part of
 * it, work waiting on someone, work in review or with a person to confirm, work finished in the period, or late work (open past due
 * or finished late in the period, as the delays report counts it).
 */
export const TASK_BOARD_VIEWS = [
  'open',
  'overdue',
  'unassigned',
  'waiting',
  'done',
  'late',
  'review',
  'confirm',
] as const;
export type TaskBoardView = (typeof TASK_BOARD_VIEWS)[number];

/** Every metric about tasks opens this list with the same filters (PRD 3.1, 9 drill-down). */
export const taskBoardQuerySchema = z.object({
  show: z.enum(TASK_BOARD_VIEWS).default('open'),
  period: z.enum(COMMAND_CENTER_PERIODS).default('this_month'),
  managerUserId: idSchema.optional(),
  projectType: projectTypeSchema.optional(),
  projectId: idSchema.optional(),
  assigneeUserId: idSchema.optional(),
  contractorId: idSchema.optional(),
  party: waitingPartySchema.optional(),
});
export type TaskBoardQuery = z.input<typeof taskBoardQuerySchema>;

export const taskBoardRowSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  projectCode: z.string(),
  projectName: z.string(),
  title: z.string(),
  stage: epcStageSchema,
  status: taskStatusSchema,
  dueDate: calendarDateSchema,
  /** India date it finished, when it has. */
  completedOn: calendarDateSchema.nullable(),
  /** Past due today (open) or at finish (completed); 0 when on time. */
  daysLate: z.number().int(),
  waitingParty: waitingPartySchema,
  assignee: z.object({ id: idSchema, name: z.string() }).nullable(),
  contractorName: z.string().nullable(),
  managerName: z.string().nullable(),
});
export type TaskBoardRow = z.infer<typeof taskBoardRowSchema>;

export const taskBoardSchema = z.object({
  range: z.object({ start: calendarDateSchema, end: calendarDateSchema }),
  rows: z.array(taskBoardRowSchema),
  /** More matched than the list shows; narrow the filters to see the rest. */
  truncated: z.boolean(),
});
export type TaskBoard = z.infer<typeof taskBoardSchema>;
