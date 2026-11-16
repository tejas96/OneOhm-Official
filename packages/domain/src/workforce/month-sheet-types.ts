/**
 * The month sheet for salary (Duty Day step 7): what each person's month is made of, in the
 * business time zone. Built from facts on every read while the month is open; frozen at lock.
 */

/** What one day of a person's month counts as. */
export const MONTH_DAY_STATUSES = [
  'present',
  'half_day',
  'absent',
  'paid_leave',
  'unpaid_leave',
  'holiday',
  'weekly_off',
  /** Before the person joined. */
  'not_joined',
  /** After the person's last working day. */
  'left',
  /** Today before a check-in, or a day still to come: not counted yet. */
  'upcoming',
] as const;
export type MonthDayStatus = (typeof MONTH_DAY_STATUSES)[number];

/** Things on a row that a person should look at before the month is locked ("amber"). */
export const MONTH_FLAG_KINDS = [
  'auto_closed',
  'delayed_tap',
  'open_correction',
  'pending_leave',
  'pending_travel',
  'doubtful_visit',
  'open_alert',
  'absent_no_reason',
] as const;
export type MonthFlagKind = (typeof MONTH_FLAG_KINDS)[number];

/** One attendance day as recorded (check-out null while the day is still open). */
export interface MonthAttendanceFact {
  readonly workDate: string;
  readonly checkInAt: Date;
  readonly checkOutAt: Date | null;
  readonly late: boolean;
  readonly autoClosed: boolean;
  readonly tapDelayed: boolean;
}

/** One stretch of employment: from the day they joined or rejoined to their last working day. */
export interface EmploymentPeriod {
  readonly from: string;
  /** Last working day; null while still employed. */
  readonly to: string | null;
}

/** A leave request touching the month; only approved and pending ones matter. */
export interface MonthLeaveFact {
  readonly id: string;
  readonly leaveType: string;
  readonly fromDate: string;
  readonly toDate: string;
  readonly halfDay: boolean;
  readonly status: 'approved' | 'pending';
  /** Paid or not as frozen when it was approved; null (pending, or older) follows the kind. */
  readonly paid: boolean | null;
}

/** A travel claim for a work date in the month. */
export interface MonthClaimFact {
  readonly id: string;
  readonly workDate: string;
  readonly amountPaise: number;
  readonly status: 'approved' | 'pending';
  /** Approved and its payable paid. */
  readonly paid: boolean;
}

export interface MonthBonusFact {
  readonly id: string;
  readonly amountPaise: number;
  readonly reason: string;
  /** Business day the bonus was approved: bonuses count in the month they are approved. */
  readonly approvedOn: string;
}

/** Everything the sheet needs about one person for one month. */
export interface MonthPersonFacts {
  readonly userId: string;
  /**
   * Employment, oldest first: from the day they were added (or an earlier recorded workday)
   * to each departure, and again from each rejoin. Days between are "left".
   */
  readonly periods: readonly EmploymentPeriod[];
  /** The monthly pay in force for the month (from the pay history); null when none. */
  readonly monthlyPayPaise: number | null;
  readonly attendance: readonly MonthAttendanceFact[];
  readonly leaves: readonly MonthLeaveFact[];
  /** Work dates with a correction waiting for a decision. */
  readonly openCorrections: readonly string[];
  readonly claims: readonly MonthClaimFact[];
  readonly bonuses: readonly MonthBonusFact[];
  /** Work dates of site visits whose route proof reads doubtful. */
  readonly doubtfulVisits: readonly string[];
  /** Days with a duty alert still open. */
  readonly openAlerts: readonly string[];
}

/** The company rules the sheet applies (Settings → Workforce and Working time). */
export interface MonthRules {
  readonly month: string;
  /** Today in the business time zone; later days are not counted yet. */
  readonly today: string;
  readonly weeklyOff: readonly number[];
  /** Holiday date → name. */
  readonly holidays: ReadonlyMap<string, string>;
  readonly halfDayHours: number;
  /**
   * Weekly offs and holidays are paid only in a week (Mon–Sun) with at least one present,
   * half or paid-leave day; a fully absent week gets no paid offs.
   */
  readonly offsNeedWorkInWeek: boolean;
  /** Every N late marks cost half a day; 0 = off. */
  readonly lateEvery: number;
  /** Leave kind key → label and whether it is paid. */
  readonly leaveKinds: ReadonlyMap<string, { readonly label: string; readonly paid: boolean }>;
}

export interface MonthDayLeave {
  readonly leaveType: string;
  readonly label: string;
  readonly paid: boolean;
  /** Half a day of leave; the other half was worked or missed. */
  readonly half: boolean;
}

export interface MonthDay {
  readonly date: string;
  readonly status: MonthDayStatus;
  /** Minutes from check-in to check-out; null with no closed attendance. */
  readonly workedMinutes: number | null;
  readonly checkInAt: string | null;
  readonly checkOutAt: string | null;
  /** Checked in but not out yet (today). */
  readonly onDuty: boolean;
  readonly late: boolean;
  readonly autoClosed: boolean;
  readonly tapDelayed: boolean;
  readonly doubtfulVisit: boolean;
  readonly openAlert: boolean;
  readonly openCorrection: boolean;
  readonly leave: MonthDayLeave | null;
  /** A leave asked for this day that waits for a decision. */
  readonly pendingLeave: boolean;
  readonly holidayName: string | null;
  /** Worked on a holiday or weekly off. */
  readonly workedOnDayOff: boolean;
  /** A holiday or weekly off not paid: nothing was worked or on paid leave that week. */
  readonly offUnpaid: boolean;
}

export interface MonthCounts {
  readonly daysInMonth: number;
  /** The last day counted: the month's end, or today while the month runs. */
  readonly countedTo: string;
  readonly workingDays: number;
  readonly present: number;
  readonly halfDays: number;
  readonly absent: number;
  readonly paidLeave: number;
  readonly unpaidLeave: number;
  /** Paid holidays and weekly offs. */
  readonly holidays: number;
  readonly weeklyOffs: number;
  /** Holidays and weekly offs in a week with no work or paid leave: not paid. */
  readonly unpaidOffs: number;
  readonly notEmployed: number;
  readonly lates: number;
  readonly lateDeduction: number;
  readonly payableDays: number;
  readonly workedMinutes: number;
}

export interface MonthMoney {
  readonly monthlyPayPaise: number | null;
  /** Monthly pay × payable days ÷ days in month, to the rupee; null without a monthly pay. */
  readonly grossPaise: number | null;
  readonly travelApprovedPaise: number;
  readonly travelPaidPaise: number;
  readonly travelPendingPaise: number;
  readonly bonusPaise: number;
}

export interface MonthFlag {
  readonly kind: MonthFlagKind;
  /** The days it is about, in order. */
  readonly days: readonly string[];
}

/** One person's month: each day, the counts, the money and what to check. */
export interface MonthRow {
  readonly userId: string;
  readonly month: string;
  readonly days: readonly MonthDay[];
  readonly counts: MonthCounts;
  readonly money: MonthMoney;
  readonly flags: readonly MonthFlag[];
}
