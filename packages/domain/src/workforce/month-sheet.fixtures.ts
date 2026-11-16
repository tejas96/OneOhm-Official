// Shared facts for the month sheet tests: October 2026 in India time.
import { zonedInstant } from '../calendar/business-calendar';
import type { MonthAttendanceFact, MonthPersonFacts, MonthRules } from './month-sheet-types';

const ZONE = 'Asia/Kolkata';
const at = (day: string, hh: number, mm = 0) => zonedInstant(day, hh * 60 + mm, ZONE);

/** A worked day from `from` to `to` (hours), late when asked. */
export const worked = (
  day: string,
  from = 9.5,
  to = 18.5,
  extra: Partial<MonthAttendanceFact> = {},
): MonthAttendanceFact => ({
  workDate: day,
  checkInAt: at(day, Math.floor(from), Math.round((from % 1) * 60)),
  checkOutAt: at(day, Math.floor(to), Math.round((to % 1) * 60)),
  late: false,
  autoClosed: false,
  tapDelayed: false,
  ...extra,
});

export const rules = (over: Partial<MonthRules> = {}): MonthRules => ({
  month: '2026-10',
  today: '2026-11-16',
  weeklyOff: [0],
  holidays: new Map([['2026-10-02', 'Gandhi Jayanti']]),
  halfDayHours: 4,
  offsNeedWorkInWeek: true,
  lateEvery: 3,
  leaveKinds: new Map([
    ['casual', { label: 'Casual leave', paid: true }],
    ['unpaid', { label: 'Unpaid leave', paid: false }],
  ]),
  ...over,
});

export const person = (over: Partial<MonthPersonFacts> = {}): MonthPersonFacts => ({
  userId: 'u1',
  periods: [{ from: '2026-01-01', to: null }],
  monthlyPayPaise: 3_100_000,
  attendance: [],
  leaves: [],
  openCorrections: [],
  claims: [],
  bonuses: [],
  doubtfulVisits: [],
  openAlerts: [],
  ...over,
});

/** October 2026: Sundays 4, 11, 18, 25; holiday on the 2nd; 26 working days. */
export const WORKING = Array.from(
  { length: 31 },
  (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`,
)
  .filter((day) => new Date(`${day}T00:00:00Z`).getUTCDay() !== 0)
  .filter((day) => day !== '2026-10-02');
