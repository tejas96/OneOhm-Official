import { addDays, monthRange } from '@oneohm/shared';
import { weekdayOf } from '../calendar/business-calendar';
import { employmentStatus } from './month-employment';
import type {
  MonthAttendanceFact,
  MonthDay,
  MonthDayLeave,
  MonthLeaveFact,
  MonthPersonFacts,
  MonthRules,
} from './month-sheet-types';

/** Every date of a `YYYY-MM` month, in order. */
export function monthDates(month: string): string[] {
  const { start, end } = monthRange(month);
  const dates: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) dates.push(day);
  return dates;
}

const covers = (leave: MonthLeaveFact, date: string) =>
  leave.fromDate <= date && date <= leave.toDate;

function leaveOn(
  leaves: readonly MonthLeaveFact[],
  date: string,
  rules: MonthRules,
): MonthDayLeave | null {
  const leave = leaves.find((one) => one.status === 'approved' && covers(one, date));
  if (!leave) return null;
  const kind = rules.leaveKinds.get(leave.leaveType);
  return {
    leaveType: leave.leaveType,
    label: kind?.label ?? leave.leaveType,
    // Frozen at approval, so changing or deleting the kind later never moves a past month.
    paid: leave.paid ?? kind?.paid ?? true,
    half: leave.halfDay && leave.fromDate === leave.toDate,
  };
}

const minutesOf = (day: MonthAttendanceFact) =>
  day.checkOutAt
    ? Math.max(0, Math.round((day.checkOutAt.getTime() - day.checkInAt.getTime()) / 60_000))
    : null;

type Status = MonthDay['status'];

/** Outside employment, still to come, or a day off; null for a working day so far. */
function calendarStatus(
  person: MonthPersonFacts,
  rules: MonthRules,
  date: string,
  holiday: boolean,
  dayOff: boolean,
): Status | null {
  const outside = employmentStatus(person.periods, date);
  if (outside) return outside;
  if (date > rules.today) return 'upcoming';
  if (holiday) return 'holiday';
  return dayOff ? 'weekly_off' : null;
}

/** A working day: leave first (a half-day leave with work is a half day), then attendance. */
function workStatus(input: {
  readonly leave: MonthDayLeave | null;
  readonly worked: boolean;
  readonly minutes: number | null;
  readonly today: boolean;
  readonly halfDayHours: number;
}): Status {
  const { leave, worked, minutes } = input;
  // A half-day leave today may still be worked for the other half: wait for the day.
  if (leave?.half && !worked && input.today) return 'upcoming';
  if (leave && !(leave.half && worked)) return leave.paid ? 'paid_leave' : 'unpaid_leave';
  if (leave) return 'half_day';
  if (!worked) return input.today ? 'upcoming' : 'absent';
  if (minutes === null) return 'present';
  return minutes >= input.halfDayHours * 60 ? 'present' : 'half_day';
}

/** The marks shown on a day, from its attendance (none without one). */
function attendanceMarks(day: MonthAttendanceFact | null, today: boolean) {
  if (!day)
    return {
      workedMinutes: null,
      checkInAt: null,
      checkOutAt: null,
      onDuty: false,
      late: false,
      autoClosed: false,
      tapDelayed: false,
    };
  return {
    workedMinutes: minutesOf(day),
    checkInAt: day.checkInAt.toISOString(),
    checkOutAt: day.checkOutAt ? day.checkOutAt.toISOString() : null,
    onDuty: day.checkOutAt === null && today,
    late: day.late,
    autoClosed: day.autoClosed,
    tapDelayed: day.tapDelayed,
  };
}

/**
 * What one day counts as, in this order: outside employment (not joined / left), still to
 * come, holiday, weekly off, approved leave (a half-day leave with work is a half day),
 * attendance (shorter than the half-day hours is a half day; an open day counts as present),
 * today without a check-in (not counted yet), else absent.
 */
export function monthDay(person: MonthPersonFacts, rules: MonthRules, date: string): MonthDay {
  const attendance = person.attendance.find((day) => day.workDate === date) ?? null;
  const holidayName = rules.holidays.get(date) ?? null;
  const dayOff = holidayName !== null || rules.weeklyOff.includes(weekdayOf(date));
  const leave = dayOff ? null : leaveOn(person.leaves, date, rules);
  const today = date === rules.today;
  const marks = attendanceMarks(attendance, today);
  const status =
    calendarStatus(person, rules, date, holidayName !== null, dayOff) ??
    workStatus({
      leave,
      worked: attendance !== null,
      minutes: marks.workedMinutes,
      today,
      halfDayHours: rules.halfDayHours,
    });
  return {
    date,
    status,
    ...marks,
    doubtfulVisit: person.doubtfulVisits.includes(date),
    // Today's alerts belong to the live map; the sheet asks about days already over.
    openAlert: date < rules.today && person.openAlerts.includes(date),
    openCorrection: person.openCorrections.includes(date),
    leave,
    pendingLeave:
      !dayOff && person.leaves.some((one) => one.status === 'pending' && covers(one, date)),
    holidayName,
    workedOnDayOff: dayOff && attendance !== null,
    offUnpaid: false,
  };
}

const WORKED = new Set<MonthDay['status']>(['present', 'half_day', 'paid_leave']);
const OFF = new Set<MonthDay['status']>(['holiday', 'weekly_off']);
/** Monday of the day's week. */
const mondayOf = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7));

/**
 * Each day of the month for one person. With `offsNeedWorkInWeek`, a holiday or weekly off is
 * not paid when its whole week (Mon–Sun, read across the month's edges) has no present, half
 * or paid-leave day. A week still running is given the benefit of the doubt.
 */
export function monthDays(person: MonthPersonFacts, rules: MonthRules): MonthDay[] {
  const days = monthDates(rules.month).map((date) => monthDay(person, rules, date));
  if (!rules.offsNeedWorkInWeek) return days;
  const worked = new Map<string, boolean>();
  const weekWorked = (monday: string) => {
    const known = worked.get(monday);
    if (known !== undefined) return known;
    const any = [0, 1, 2, 3, 4, 5, 6].some((offset) => {
      const date = addDays(monday, offset);
      const inMonth = days.find((day) => day.date === date);
      return WORKED.has((inMonth ?? monthDay(person, rules, date)).status);
    });
    worked.set(monday, any);
    return any;
  };
  return days.map((day) => {
    if (!OFF.has(day.status)) return day;
    const monday = mondayOf(day.date);
    const over = addDays(monday, 6) < rules.today;
    return over && !weekWorked(monday) ? { ...day, offUnpaid: true } : day;
  });
}
