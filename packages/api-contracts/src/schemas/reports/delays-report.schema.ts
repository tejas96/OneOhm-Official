import { EPC_STAGES, WAITING_PARTIES } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema } from '../../common/primitives';
import { reportMetaSchema } from './business-report.schema';

const int = z.number().int();
const party = z.enum(WAITING_PARTIES);
/** One number per cause, in the order internal, customer, bank, DISCOM. */
const perParty = z.object({ internal: int, customer: int, bank: int, discom: int });

/**
 * Where days are lost and on whom (PRD 3.1, 3.8): days late split by the party a step
 * waits on, with DISCOM (utility) time kept apart from internal time.
 */
export const delaysReportSchema = z.object({
  meta: reportMetaSchema,
  totals: z.object({
    /** Tasks finished in the period, on time or not. */
    finished: int,
    finishedLate: int,
    /** Open tasks already past their due date today. */
    openLate: int,
    /** Open tasks marked waiting on someone today. */
    waitingNow: int,
  }),
  /** Every cause, always all four: late tasks and their days, finished and still open. */
  byParty: z.array(
    z.object({
      party,
      finishedLate: int,
      finishedDays: int,
      openLate: int,
      openDays: int,
    }),
  ),
  /** Tasks finished late, by the week or month they finished. */
  byBucket: z.array(
    z.object({
      start: calendarDateSchema,
      end: calendarDateSchema,
      days: perParty,
      tasks: perParty,
    }),
  ),
  /** Steps (one per template) that ran late, most days lost first. */
  steps: z.array(
    z.object({
      templateKey: z.string(),
      title: z.string(),
      stage: z.enum(EPC_STAGES),
      /** The cause with the most late days on this step. */
      party,
      late: int,
      /** Of the late ones, still open today. */
      open: int,
      days: int,
      averageDays: z.number().nullable(),
    }),
  ),
  /** Utility time per DISCOM: its steps finished in the period and those open now. */
  discoms: z.array(
    z.object({
      discomId: idSchema,
      code: z.string(),
      name: z.string(),
      finished: int,
      late: int,
      lateDays: int,
      /** Days from the step's start to its finish, for steps finished in the period. */
      averageDays: z.number().nullable(),
      openNow: int,
      openLate: int,
    }),
  ),
  /** Open tasks past due or waiting today, longest first. */
  waiting: z.array(
    z.object({
      taskId: idSchema,
      projectId: idSchema,
      projectCode: z.string(),
      projectName: z.string(),
      title: z.string(),
      party,
      waiting: z.boolean(),
      dueDate: calendarDateSchema,
      daysLate: int,
      waitingDays: int.nullable(),
    }),
  ),
});
export type DelaysReport = z.infer<typeof delaysReportSchema>;
