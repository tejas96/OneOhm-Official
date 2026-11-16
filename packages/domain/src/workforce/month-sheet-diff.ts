import type { BusinessCalendar } from '../calendar/business-calendar';
import type { MonthRow, MonthRules } from './month-sheet-types';
import { leaveIsPaid, type WorkforcePolicy } from './policy';

/**
 * The numbers compared between a locked row and the facts today: only what salary is made of
 * (the parts of payable days, gross, approved travel and bonus). Paying a claim, a new late
 * mark under the rule's step or an unpaid day already counted do not make a row "changed".
 */
export const MONTH_DIFF_FIELDS = [
  'present',
  'halfDays',
  'paidLeave',
  'holidays',
  'weeklyOffs',
  'lateDeduction',
  'payableDays',
  'grossPaise',
  'travelApprovedPaise',
  'bonusPaise',
] as const;
export type MonthDiffField = (typeof MONTH_DIFF_FIELDS)[number];

export interface MonthDiff {
  readonly field: MonthDiffField;
  readonly before: number | null;
  readonly after: number | null;
}

type Numbers = Pick<MonthRow, 'counts' | 'money'>;

const numberOf = (row: Numbers, field: MonthDiffField): number | null => {
  switch (field) {
    case 'grossPaise':
    case 'travelApprovedPaise':
    case 'bonusPaise':
      return row.money[field];
    default:
      return row.counts[field];
  }
};

/** What changed in the facts since the row was locked; empty when nothing did. */
export function monthRowDiff(locked: Numbers, live: Numbers): MonthDiff[] {
  return MONTH_DIFF_FIELDS.flatMap((field) => {
    const before = numberOf(locked, field);
    const after = numberOf(live, field);
    return before === after ? [] : [{ field, before, after }];
  });
}

/** The sheet's rules from the workforce policy and the business calendar, for one month. */
export function monthRulesFrom(input: {
  readonly month: string;
  readonly today: string;
  readonly policy: Pick<WorkforcePolicy, 'leaveTypes' | 'attendance'>;
  readonly calendar: Pick<BusinessCalendar, 'weeklyOff'>;
  readonly holidays: readonly { readonly day: string; readonly name: string }[];
}): MonthRules {
  const { policy } = input;
  return {
    month: input.month,
    today: input.today,
    weeklyOff: input.calendar.weeklyOff,
    holidays: new Map(input.holidays.map((holiday) => [holiday.day, holiday.name])),
    halfDayHours: policy.attendance.halfDayHours,
    offsNeedWorkInWeek: policy.attendance.offsNeedWorkInWeek,
    lateEvery: policy.attendance.lateDeduction.every,
    leaveKinds: new Map(
      policy.leaveTypes.map((kind) => [kind.key, { label: kind.label, paid: leaveIsPaid(kind) }]),
    ),
  };
}
