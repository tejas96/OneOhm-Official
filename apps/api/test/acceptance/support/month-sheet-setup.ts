// The full month every month sheet scenario (91-*) starts from: last month, one holiday, and
// a worker with a short day, an absence, paid leave, unpaid leave (approved through the API, so
// its paid flag is frozen), a half-day leave, three lates, travel, a bonus and a monthly pay.
import { closeDb, rows } from './db';
import type { Session } from './http';
import {
  approvedBonus,
  approvedClaim,
  daysOf,
  lastMonth,
  leave,
  type Policy,
  weekday,
  withSheetRules,
  workDay,
} from './month-sheet';
import { type OwnPerson, ownPerson, retire } from './people';

export interface MonthSetUp {
  readonly month: string;
  readonly all: string[];
  /** Calendar days in the month. */
  readonly D: number;
  /** Working days of the month (not a weekly off, not the holiday), in order. */
  readonly W: string[];
  readonly holiday: string;
  readonly saved: Policy;
  readonly manager: OwnPerson;
  readonly worker: OwnPerson;
  readonly people: OwnPerson[];
}

const HOLIDAY = 'Month sheet holiday (test)';

/** Back-dates people to 40 days before the month, as if they joined long ago. */
export const joinedLongAgo = (ids: string[], month: string) =>
  rows("UPDATE users SET created_at = $2::date - interval '40 days' WHERE id = ANY($1)", [
    ids,
    `${month}-01`,
  ]);

/** Makes sure the month is open (an earlier scenario may have left it locked). */
export async function openMonth(admin: Session, month: string): Promise<void> {
  await admin.raw('POST', '/month-sheet/unlock', { month, reason: 'Scenario starts open' });
}

export async function setUpMonth(admin: Session, label: string): Promise<MonthSetUp> {
  const month = lastMonth();
  const all = daysOf(month);
  const { saved } = await withSheetRules(admin);
  await openMonth(admin, month);
  const manager = await ownPerson(admin, `${label} Manager (test)`, ['sales']);
  const worker = await ownPerson(admin, `${label} Worker (test)`, ['sales']);
  await admin.patch(`/people/${worker.id}`, {
    reportsToUserId: manager.id,
    monthlyPayPaise: 3_100_000,
  });
  await joinedLongAgo([worker.id, manager.id], month);
  const working = all.filter((day) => !saved.weeklyOff.includes(weekday(day)));
  const holiday = working[1] as string;
  await rows('INSERT INTO holidays (day, name) VALUES ($1, $2) ON CONFLICT (day) DO NOTHING', [
    holiday,
    HOLIDAY,
  ]);
  const W = working.filter((day) => day !== holiday);
  const id = worker.id;
  const special = new Set(W.slice(2, 7));
  for (const [index, day] of W.entries()) {
    if (special.has(day)) continue;
    const late = index >= 7 && index <= 9;
    await workDay(id, day, late ? '10:30' : '09:30', '18:30', late);
  }
  await workDay(id, W[2] as string, '10:00', '12:30');
  await leave(id, 'casual', W[4] as string);
  // Unpaid leave asked for and approved through the API: approval freezes "not paid" on it.
  const [asked] = await rows<{ id: string }>(
    `INSERT INTO leave_requests (user_id, leave_type, from_date, to_date, half_days, status, reason)
     VALUES ($1, 'unpaid', $2, $2, 2, 'pending', 'Month sheet test') RETURNING id`,
    [id, W[5]],
  );
  await admin.post(`/leave/${asked?.id}/decide`, { approve: true });
  await leave(id, 'casual', W[6] as string, true);
  await workDay(id, W[6] as string, '14:00', '18:30');
  await approvedClaim(id, W[10] as string, 42_000, true);
  await approvedClaim(id, W[11] as string, 18_000, false);
  await approvedBonus(id, W[12] as string, 150_000);
  return {
    month,
    all,
    D: all.length,
    W,
    holiday,
    saved,
    manager,
    worker,
    people: [manager, worker],
  };
}

export async function tearDownMonth(admin: Session, set: MonthSetUp, extra: OwnPerson[] = []) {
  await admin.put('/settings/workforce', set.saved);
  await rows('DELETE FROM holidays WHERE day = $1 AND name = $2', [set.holiday, HOLIDAY]);
  await openMonth(admin, set.month);
  await retire(admin, [...set.people, ...extra]);
  await closeDb();
}

/** Gross for the worker's 3,100,000-paise pay over `payable` of `days` days, to the rupee. */
export const grossOf = (payable: number, days: number, pay = 3_100_000) =>
  Math.round((pay * payable) / days / 100) * 100;
