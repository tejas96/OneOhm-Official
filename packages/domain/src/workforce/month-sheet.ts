import { monthRange } from '@oneohm/shared';
import { monthDays } from './month-days';
import type {
  MonthCounts,
  MonthDay,
  MonthFlag,
  MonthFlagKind,
  MonthMoney,
  MonthPersonFacts,
  MonthRow,
  MonthRules,
} from './month-sheet-types';

/** Half a day off for every `every` late marks; 0 means the rule is off. */
export function lateDeductionDays(lates: number, every: number): number {
  if (every <= 0 || lates <= 0) return 0;
  return Math.floor(lates / every) / 2;
}

/**
 * Monthly pay × payable days ÷ calendar days in the month, rounded to the rupee (paise in,
 * paise out). Null without a monthly pay.
 */
export function grossPayPaise(
  monthlyPayPaise: number | null,
  payableDays: number,
  daysInMonth: number,
): number | null {
  if (monthlyPayPaise === null || daysInMonth <= 0) return null;
  const rupees = (monthlyPayPaise * payableDays) / daysInMonth / 100;
  return Math.round(rupees) * 100;
}

type Halves = Record<
  'working' | 'present' | 'half' | 'absent' | 'paid' | 'unpaid' | 'holiday' | 'off' | 'unpaidOff',
  number
>;

/** What one counted day adds, in half days. */
function dayHalves(day: MonthDay): Partial<Halves> {
  const leaveKey = day.leave?.paid === false ? 'unpaid' : 'paid';
  if (day.offUnpaid) return { unpaidOff: 2 };
  switch (day.status) {
    case 'holiday':
      return { holiday: 2 };
    case 'weekly_off':
      return { off: 2 };
    case 'present':
      return { working: 2, present: 2 };
    case 'half_day':
      return day.leave ? { working: 2, half: 2, [leaveKey]: 1 } : { working: 2, half: 2 };
    case 'paid_leave':
    case 'unpaid_leave': {
      const leave = day.leave?.half ? 1 : 2;
      return { working: 2, [leaveKey]: leave, absent: 2 - leave };
    }
    case 'absent':
      return { working: 2, absent: 2 };
    default:
      return {};
  }
}

const OUTSIDE = new Set<MonthDay['status']>(['not_joined', 'left']);

/**
 * The month's counts, kept in half days so they stay exact. Payable days = present + half
 * of each half day + paid leave + holidays + weekly offs − the late deduction (never below 0).
 */
export function monthCounts(days: readonly MonthDay[], rules: MonthRules): MonthCounts {
  const halves: Halves = {
    working: 0,
    present: 0,
    half: 0,
    absent: 0,
    paid: 0,
    unpaid: 0,
    holiday: 0,
    off: 0,
    unpaidOff: 0,
  };
  const counted = days.filter((day) => day.status !== 'upcoming' && !OUTSIDE.has(day.status));
  for (const day of counted)
    for (const [key, value] of Object.entries(dayHalves(day))) halves[key as keyof Halves] += value;
  const lates = counted.filter((day) => day.late).length;
  const lateDeduction = lateDeductionDays(lates, rules.lateEvery);
  const payable =
    (halves.present + halves.half / 2 + halves.paid + halves.holiday + halves.off) / 2 -
    lateDeduction;
  const { end } = monthRange(rules.month);
  return {
    daysInMonth: days.length,
    countedTo: rules.today < end ? rules.today : end,
    workingDays: halves.working / 2,
    present: halves.present / 2,
    halfDays: halves.half / 2,
    absent: halves.absent / 2,
    paidLeave: halves.paid / 2,
    unpaidLeave: halves.unpaid / 2,
    holidays: halves.holiday / 2,
    weeklyOffs: halves.off / 2,
    unpaidOffs: halves.unpaidOff / 2,
    notEmployed: days.filter((day) => OUTSIDE.has(day.status)).length,
    lates,
    lateDeduction,
    payableDays: Math.max(0, payable),
    workedMinutes: counted.reduce((sum, day) => sum + (day.workedMinutes ?? 0), 0),
  };
}

const inMonth = (month: string, date: string) => date.startsWith(`${month}-`);

/** Travel for work dates in the month (approved, of which paid; and waiting) and bonuses approved in it. */
export function monthMoney(
  person: MonthPersonFacts,
  counts: MonthCounts,
  month: string,
): MonthMoney {
  const claims = person.claims.filter((claim) => inMonth(month, claim.workDate));
  const sum = (list: readonly { amountPaise: number }[]) =>
    list.reduce((total, one) => total + one.amountPaise, 0);
  const approved = claims.filter((claim) => claim.status === 'approved');
  return {
    monthlyPayPaise: person.monthlyPayPaise,
    grossPaise: grossPayPaise(person.monthlyPayPaise, counts.payableDays, counts.daysInMonth),
    travelApprovedPaise: sum(approved),
    travelPaidPaise: sum(approved.filter((claim) => claim.paid)),
    travelPendingPaise: sum(claims.filter((claim) => claim.status === 'pending')),
    bonusPaise: sum(person.bonuses.filter((bonus) => inMonth(month, bonus.approvedOn))),
  };
}

const counted = (day: MonthDay) =>
  day.status !== 'upcoming' && day.status !== 'not_joined' && day.status !== 'left';

/** What to check before locking, each with its days. Nothing here blocks: a person decides. */
export function monthFlags(
  person: MonthPersonFacts,
  days: readonly MonthDay[],
  month: string,
): MonthFlag[] {
  const pick = (test: (day: MonthDay) => boolean) =>
    days.filter((day) => test(day)).map((day) => day.date);
  const lists: Record<MonthFlagKind, string[]> = {
    auto_closed: pick((day) => day.autoClosed),
    delayed_tap: pick((day) => day.tapDelayed),
    open_correction: pick((day) => day.openCorrection),
    pending_leave: pick((day) => day.pendingLeave && day.status !== 'not_joined'),
    pending_travel: [
      ...new Set(
        person.claims
          .filter((claim) => claim.status === 'pending' && inMonth(month, claim.workDate))
          .map((claim) => claim.workDate),
      ),
    ].sort(),
    doubtful_visit: pick((day) => day.doubtfulVisit),
    open_alert: pick((day) => day.openAlert),
    absent_no_reason: pick(
      (day) =>
        counted(day) &&
        !day.pendingLeave &&
        (day.status === 'absent' ||
          (day.leave?.half === true && day.status !== 'half_day' && day.workedMinutes === null)),
    ),
  };
  return (Object.entries(lists) as [MonthFlagKind, string[]][])
    .filter(([, list]) => list.length > 0)
    .map(([kind, list]) => ({ kind, days: list }));
}

/** One person's whole month: days, counts, money and flags. */
export function monthRow(person: MonthPersonFacts, rules: MonthRules): MonthRow {
  const days = monthDays(person, rules);
  const counts = monthCounts(days, rules);
  return {
    userId: person.userId,
    month: rules.month,
    days,
    counts,
    money: monthMoney(person, counts, rules.month),
    flags: monthFlags(person, days, rules.month),
  };
}

/** A row needs a look (amber) when anything is flagged. */
export const isAmber = (row: Pick<MonthRow, 'flags'>): boolean => row.flags.length > 0;
