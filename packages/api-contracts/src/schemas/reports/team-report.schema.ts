import { z } from 'zod';
import { calendarDateSchema, idSchema } from '../../common/primitives';
import { reportMetaSchema } from './business-report.schema';

const int = z.number().int();
const rate = z.number().nullable();

/** Work on the projects in view: finished in the period, and open or past due today. */
const workSchema = z.object({
  finished: int,
  onTime: int,
  late: int,
  /** Of the late ones, those that were waiting on the customer, bank or DISCOM. */
  lateOnOthers: int,
  onTimeRate: rate,
  open: int,
  pastDue: int,
});

/**
 * Who is delivering, who is overloaded and who is away (PRD 3.1): tasks per person and
 * per contractor crew, with leave and attendance for staff.
 */
export const teamReportSchema = z.object({
  meta: reportMetaSchema,
  totals: workSchema.extend({
    /** Staff with at least one open task past due. */
    peopleBehind: int,
    /** Approved leave inside the period, in half days. */
    leaveHalfDays: int,
    /** Approved leave from tomorrow on, in half days. */
    leaveAheadHalfDays: int,
    awayToday: int,
    daysPresent: int,
    lateCheckIns: int,
    peopleCheckedIn: int,
  }),
  /** Tasks finished per week or month, on time and late, for staff and for crews. */
  byBucket: z.array(
    z.object({
      start: calendarDateSchema,
      end: calendarDateSchema,
      staffOnTime: int,
      staffLate: int,
      crewOnTime: int,
      crewLate: int,
    }),
  ),
  people: z.array(
    workSchema.extend({
      userId: idSchema,
      name: z.string(),
      designation: z.string().nullable(),
      onLeaveToday: z.boolean(),
      leaveHalfDays: int,
      daysPresent: int,
      lateCheckIns: int,
    }),
  ),
  crews: z.array(
    workSchema.extend({
      contractorId: idSchema,
      name: z.string(),
      members: int,
    }),
  ),
  /** Approved leave today or later, soonest first. */
  away: z.array(
    z.object({
      requestId: idSchema,
      userId: idSchema,
      name: z.string(),
      leaveType: z.string(),
      fromDate: calendarDateSchema,
      toDate: calendarDateSchema,
      halfDays: int,
      today: z.boolean(),
    }),
  ),
});
export type TeamReport = z.infer<typeof teamReportSchema>;
