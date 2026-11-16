import { MONTH_DAY_STATUSES, MONTH_DIFF_FIELDS, MONTH_FLAG_KINDS } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema } from '../common/primitives';
import { monthSchema } from './monthly-review.schema';

const userRef = z.object({ id: idSchema, fullName: z.string() });

/** Counts for one person's month; days may be halves (0.5). */
export const monthCountsSchema = z.object({
  daysInMonth: z.number().int(),
  /** The last day counted: the month's end, or today while it runs. */
  countedTo: calendarDateSchema,
  workingDays: z.number(),
  present: z.number(),
  halfDays: z.number(),
  absent: z.number(),
  paidLeave: z.number(),
  unpaidLeave: z.number(),
  /** Paid holidays and weekly offs. */
  holidays: z.number(),
  weeklyOffs: z.number(),
  /** Holidays and weekly offs not paid: no work or paid leave in their week (policy). */
  unpaidOffs: z.number(),
  /** Days before joining or after leaving. */
  notEmployed: z.number(),
  lates: z.number().int(),
  /** Days taken off for lates under the rule. */
  lateDeduction: z.number(),
  payableDays: z.number(),
  workedMinutes: z.number().int(),
});

/**
 * Money for the month. `monthlyPayPaise` and `grossPaise` are null without a monthly pay, and
 * always null for a manager (no pay figures). Travel is for work dates in the month; bonuses
 * count in the month they were approved.
 */
export const monthMoneySchema = z.object({
  monthlyPayPaise: z.number().int().nullable(),
  grossPaise: z.number().int().nullable(),
  travelApprovedPaise: z.number().int(),
  travelPaidPaise: z.number().int(),
  travelPendingPaise: z.number().int(),
  bonusPaise: z.number().int(),
});

export const monthFlagSchema = z.object({
  kind: z.enum(MONTH_FLAG_KINDS),
  days: z.array(calendarDateSchema),
});

/** A number that differs from the locked row: before (locked) and after (facts now). */
export const monthDiffSchema = z.object({
  field: z.enum(MONTH_DIFF_FIELDS),
  before: z.number().nullable(),
  after: z.number().nullable(),
});

export const monthSheetPersonRefSchema = z.object({
  id: idSchema,
  fullName: z.string(),
  employeeCode: z.string().nullable(),
  phone: z.string().nullable(),
  designation: z.string().nullable(),
  avatarSwatch: z.number().int(),
  reportsTo: userRef.nullable(),
});

/** One row of the sheet. Locked: the frozen numbers, with `changes` when the facts moved since. */
export const monthSheetRowSchema = z.object({
  person: monthSheetPersonRefSchema,
  counts: monthCountsSchema,
  money: monthMoneySchema,
  flags: z.array(monthFlagSchema),
  /** Anything flagged: "check this". */
  amber: z.boolean(),
  /** When the row was frozen (lock or Refresh row); null while the month is open. */
  frozenAt: instantSchema.nullable(),
  /**
   * False for someone who qualifies now but is not in the locked sheet (added after the lock):
   * their numbers are live and HR can add the row. Always true while the month is open.
   */
  inLock: z.boolean(),
  changes: z.array(monthDiffSchema),
});
export type MonthSheetRow = z.infer<typeof monthSheetRowSchema>;

export const monthRulesOutSchema = z.object({
  halfDayHours: z.number(),
  lateEvery: z.number().int(),
  offsNeedWorkInWeek: z.boolean(),
});

export const monthUnlockSchema = z.object({ at: instantSchema, by: userRef, reason: z.string() });

/** The month's lock state, shared by the sheet, one person's month and My month. */
export const monthLockSchema = z.object({
  month: monthSchema,
  status: z.enum(['open', 'locked']),
  lockedAt: instantSchema.nullable(),
  lockedBy: userRef.nullable(),
  /** Every unlock, oldest first, with its reason. */
  unlocks: z.array(monthUnlockSchema),
});

export const monthSheetSchema = monthLockSchema.extend({
  today: calendarDateSchema,
  daysInMonth: z.number().int(),
  countedTo: calendarDateSchema,
  /** `all` for HR and finance; `reports` for a manager's direct reports (read-only). */
  scope: z.enum(['all', 'reports']),
  /** Monthly pay and gross are shown (HR and finance). */
  showsPay: z.boolean(),
  /** May lock, unlock and refresh rows (people.manage). */
  canManage: z.boolean(),
  /** The month is over (from the day after its last day), so it may be locked. */
  lockable: z.boolean(),
  rules: monthRulesOutSchema,
  summary: z.object({
    people: z.number().int(),
    payableDays: z.number(),
    /** Null when pay is not shown. */
    grossPaise: z.number().int().nullable(),
    travelApprovedPaise: z.number().int(),
    travelPaidPaise: z.number().int(),
    bonusPaise: z.number().int(),
    amberRows: z.number().int(),
    changedRows: z.number().int(),
    /** People who qualify now but are not in the locked sheet. */
    notInLockRows: z.number().int(),
  }),
  /** Amber rows first, then by name. */
  rows: z.array(monthSheetRowSchema),
});
export type MonthSheet = z.infer<typeof monthSheetSchema>;

export const monthDaySchema = z.object({
  date: calendarDateSchema,
  status: z.enum(MONTH_DAY_STATUSES),
  workedMinutes: z.number().int().nullable(),
  checkInAt: instantSchema.nullable(),
  checkOutAt: instantSchema.nullable(),
  onDuty: z.boolean(),
  late: z.boolean(),
  autoClosed: z.boolean(),
  tapDelayed: z.boolean(),
  doubtfulVisit: z.boolean(),
  openAlert: z.boolean(),
  openCorrection: z.boolean(),
  leave: z
    .object({ leaveType: z.string(), label: z.string(), paid: z.boolean(), half: z.boolean() })
    .nullable(),
  pendingLeave: z.boolean(),
  holidayName: z.string().nullable(),
  workedOnDayOff: z.boolean(),
  /** A holiday or weekly off not paid: nothing worked or on paid leave in its week. */
  offUnpaid: z.boolean(),
});
export type MonthDayRecord = z.infer<typeof monthDaySchema>;

/** The records behind the numbers, so each flag opens the right place. */
export const monthItemsSchema = z.object({
  leaves: z.array(
    z.object({
      id: idSchema,
      label: z.string(),
      fromDate: calendarDateSchema,
      toDate: calendarDateSchema,
      halfDay: z.boolean(),
      paid: z.boolean(),
      status: z.enum(['approved', 'pending']),
    }),
  ),
  corrections: z.array(z.object({ id: idSchema, workDate: calendarDateSchema })),
  claims: z.array(
    z.object({
      id: idSchema,
      workDate: calendarDateSchema,
      amountPaise: z.number().int(),
      status: z.enum(['approved', 'pending']),
      paid: z.boolean(),
    }),
  ),
  bonuses: z.array(
    z.object({
      id: idSchema,
      reason: z.string(),
      amountPaise: z.number().int(),
      approvedOn: calendarDateSchema,
    }),
  ),
  alerts: z.array(z.object({ id: idSchema, day: calendarDateSchema, title: z.string() })),
});

/** One person's month, day by day: the HR side panel and the worker's My month. */
export const monthSheetPersonSchema = z.object({
  lock: monthLockSchema,
  today: calendarDateSchema,
  showsPay: z.boolean(),
  canManage: z.boolean(),
  rules: monthRulesOutSchema,
  row: monthSheetRowSchema,
  days: z.array(monthDaySchema),
  items: monthItemsSchema,
});
export type MonthSheetPerson = z.infer<typeof monthSheetPersonSchema>;

export const monthQuerySchema = z.object({ month: monthSchema });
export const monthUnlockInputSchema = z.object({
  month: monthSchema,
  reason: z.string().trim().min(5, 'Say why, in a few words.').max(500),
});
