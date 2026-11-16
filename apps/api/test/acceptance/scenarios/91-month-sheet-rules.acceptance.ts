import type { MonthSheetPerson } from '@oneohm/api-contracts';
import { addDays } from '@oneohm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rows } from '../support/db';
import { Session } from '../support/http';
import { weekday, workDay } from '../support/month-sheet';
import {
  grossOf,
  joinedLongAgo,
  type MonthSetUp,
  setUpMonth,
  tearDownMonth,
} from '../support/month-sheet-setup';
import { type OwnPerson, ownPerson } from '../support/people';
import { indiaDate } from '../support/travel';

// Duty Day step 7, the owner's rules: days off are paid only in a week with some work or paid
// leave; the days between leaving and rejoining are "left"; each month is paid with the pay in
// force then (a raise today does not move last month); unpaid leave stays unpaid once approved
// even if its kind changes later; the audit says pay changed, never to what, and only when it did.
describe('Month sheet: rules', () => {
  let admin: Session;
  let set: MonthSetUp;
  const extra: OwnPerson[] = [];
  const monthOf = (id: string) =>
    admin.get<MonthSheetPerson>(`/month-sheet/${id}?month=${set.month}`);

  beforeAll(async () => {
    admin = await Session.admin();
    set = await setUpMonth(admin, 'Rules');
  });
  afterAll(() => tearDownMonth(admin, set, extra));

  it('a fully absent week (Monday to Sunday) gets no paid days off', async () => {
    const away = await ownPerson(admin, 'Rules Away Week (test)', ['sales']);
    extra.push(away);
    await joinedLongAgo([away.id], set.month);
    // The second full week of the month, after the test holiday.
    const monday = set.all.filter((day) => weekday(day) === 1 && day > set.holiday)[0] as string;
    const week = new Set(Array.from({ length: 7 }, (_, i) => addDays(monday, i)));
    for (const day of set.W) if (!week.has(day)) await workDay(away.id, day, '09:30', '18:30');
    const one = await monthOf(away.id);
    const offsThatWeek = [...week].filter((day) => set.saved.weeklyOff.includes(weekday(day)));
    expect(one.row.counts.unpaidOffs).toBe(offsThatWeek.length);
    for (const day of offsThatWeek)
      expect(one.days.find((entry) => entry.date === day)).toMatchObject({ offUnpaid: true });
    const workingThatWeek = set.W.filter((day) => week.has(day)).length;
    expect(one.row.counts.payableDays).toBe(set.D - workingThatWeek - offsThatWeek.length);
  });

  it('the days between leaving and rejoining are "left"', async () => {
    const back = await ownPerson(admin, 'Rules Came Back (test)', ['sales']);
    extra.push(back);
    await joinedLongAgo([back.id], set.month);
    const lastDay = set.W[9] as string;
    for (const day of set.W.filter((one) => one <= lastDay))
      await workDay(back.id, day, '09:30', '18:30');
    await admin.post(`/people/${back.id}/remove`, {
      handToUserId: admin.userId,
      lastWorkingDay: lastDay,
      tellCustomers: false,
    });
    await admin.post(`/people/${back.id}/rejoin`);
    const events = await rows<{ kind: string; day: string }>(
      'SELECT kind, day::text AS day FROM employment_events WHERE user_id = $1 ORDER BY created_at',
      [back.id],
    );
    expect(events).toEqual([
      { kind: 'left', day: lastDay },
      { kind: 'rejoined', day: indiaDate() },
    ]);
    const one = await monthOf(back.id);
    expect(one.days.find((day) => day.date === addDays(lastDay, 1))?.status).toBe('left');
    expect(one.days.at(-1)?.status).toBe('left');
    expect(one.row.flags).toEqual([]);
  });

  it('pays each month with the pay in force then; the audit says only that it changed', async () => {
    const before = await monthOf(set.worker.id);
    expect(before.row.money.grossPaise).toBe(grossOf(set.D - 3, set.D));
    await admin.patch(`/people/${set.worker.id}`, { monthlyPayPaise: 3_500_000 });
    await admin.patch(`/people/${set.worker.id}`, { monthlyPayPaise: 3_500_000 });
    const after = await monthOf(set.worker.id);
    expect(after.row.money).toMatchObject({
      monthlyPayPaise: 3_100_000,
      grossPaise: grossOf(set.D - 3, set.D),
    });
    const mine = await (await Session.code(set.worker.phone)).get<MonthSheetPerson>(
      `/me/month?month=${indiaDate().slice(0, 7)}`,
    );
    expect(mine.row.money.monthlyPayPaise).toBe(3_500_000);
    const history = await rows('SELECT 1 FROM pay_history WHERE user_id = $1', [set.worker.id]);
    expect(history).toHaveLength(2);
    const audits = await rows<{ data: Record<string, unknown> }>(
      "SELECT data FROM audit_log WHERE action = 'person.updated' AND entity_id = $1 ORDER BY created_at",
      [set.worker.id],
    );
    expect(audits.filter((one) => one.data.monthlyPayChanged === true)).toHaveLength(2);
    expect(JSON.stringify(audits)).not.toMatch(/3500000|3100000|monthlyPayPaise/);
  });

  it('unpaid leave stays unpaid once approved, even if its kind is made paid later', async () => {
    const [frozen] = await rows<{ paid: boolean }>(
      "SELECT paid FROM leave_requests WHERE user_id = $1 AND leave_type = 'unpaid'",
      [set.worker.id],
    );
    expect(frozen?.paid).toBe(false);
    const { policy } = await admin.get<{
      policy: { leaveTypes: { key: string; paid?: boolean }[] };
    }>('/settings/workforce');
    await admin.put('/settings/workforce', {
      ...policy,
      leaveTypes: policy.leaveTypes.map((kind) => ({ ...kind, paid: true })),
    });
    const one = await monthOf(set.worker.id);
    expect(one.row.counts).toMatchObject({ unpaidLeave: 1, payableDays: set.D - 3 });
    expect(one.items.leaves.find((leave) => leave.fromDate === set.W[5])?.paid).toBe(false);
  });
});
