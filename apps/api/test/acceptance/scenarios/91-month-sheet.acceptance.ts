import type { MonthSheet, MonthSheetPerson } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../support/http';
import { idOf, weekday } from '../support/month-sheet';
import { grossOf, type MonthSetUp, setUpMonth, tearDownMonth } from '../support/month-sheet-setup';
import { STAFF } from '../support/team';

// Duty Day step 7: the month sheet for salary. One person's full month (present, a short day,
// an absence, paid and unpaid leave, a half-day leave, a holiday, weekly offs, three lates with
// "every 3 lates = ½ day" on, travel, a bonus and a monthly pay) gives exact numbers. HR and
// finance see everyone with pay; a manager sees their report without pay; a worker sees only
// their own month; the CSV keeps pay private. Locking: 91-month-sheet-lock. Rules: -rules.
describe('Month sheet', () => {
  let admin: Session;
  let set: MonthSetUp;
  let month = '';
  let D = 0;
  let W: string[] = [];
  let holiday = '';
  const people = {} as Record<'manager' | 'worker', { id: string; phone: string }>;
  const p = (key: 'manager' | 'worker') => people[key];
  const sheetOf = (who: Session) => who.raw<MonthSheet>('GET', `/month-sheet?month=${month}`);
  const rowOf = (sheet: MonthSheet) => sheet.rows.find((row) => row.person.id === p('worker').id);

  beforeAll(async () => {
    admin = await Session.admin();
    set = await setUpMonth(admin, 'Month');
    ({ month, D, W, holiday } = set);
    people.manager = set.manager;
    people.worker = set.worker;
  });
  afterAll(() => tearDownMonth(admin, set));

  it('counts the month exactly, with gross pay, travel and bonus, and is never cached', async () => {
    const reply = await sheetOf(admin);
    expect(reply.status).toBe(200);
    expect(reply.headers.get('cache-control')).toBe('private, no-store');
    const row = rowOf(reply.body);
    const offs = set.all.filter((day) => set.saved.weeklyOff.includes(weekday(day))).length;
    expect(row?.counts).toMatchObject({
      daysInMonth: D,
      workingDays: W.length,
      present: W.length - 5,
      halfDays: 2,
      absent: 1,
      paidLeave: 1.5,
      unpaidLeave: 1,
      holidays: 1,
      weeklyOffs: offs,
      lates: 3,
      lateDeduction: 0.5,
      payableDays: D - 3,
    });
    expect(row?.money).toEqual({
      monthlyPayPaise: 3_100_000,
      grossPaise: grossOf(D - 3, D),
      travelApprovedPaise: 60_000,
      travelPaidPaise: 42_000,
      travelPendingPaise: 0,
      bonusPaise: 150_000,
    });
    expect(row?.flags).toEqual([{ kind: 'absent_no_reason', days: [W[3]] }]);
    expect(row?.amber).toBe(true);
    expect(reply.body).toMatchObject({ scope: 'all', showsPay: true, canManage: true });
    expect(reply.body.rules).toEqual({ halfDayHours: 4, lateEvery: 3, offsNeedWorkInWeek: true });
  });

  it('shows each day and the records behind the numbers', async () => {
    const one = await admin.get<MonthSheetPerson>(`/month-sheet/${p('worker').id}?month=${month}`);
    const status = (day: string) => one.days.find((entry) => entry.date === day)?.status;
    expect(status(holiday)).toBe('holiday');
    expect(status(W[2] as string)).toBe('half_day');
    expect(status(W[3] as string)).toBe('absent');
    expect(status(W[4] as string)).toBe('paid_leave');
    expect(status(W[5] as string)).toBe('unpaid_leave');
    expect(status(W[6] as string)).toBe('half_day');
    expect(one.items.claims.map((claim) => claim.paid).sort()).toEqual([false, true]);
    expect(one.items.bonuses).toHaveLength(1);
    expect(one.items.leaves.find((entry) => entry.label === 'Unpaid leave')?.paid).toBe(false);
  });

  it('a manager sees their report read-only without pay; a worker only their own month', async () => {
    const asManager = await Session.code(p('manager').phone);
    const sheet = (await sheetOf(asManager)).body;
    expect(sheet).toMatchObject({ scope: 'reports', showsPay: false, canManage: false });
    expect(sheet.rows.map((row) => row.person.id)).toEqual([p('worker').id]);
    expect(sheet.rows[0]?.money).toMatchObject({ monthlyPayPaise: null, grossPaise: null });
    expect(sheet.summary.grossPaise).toBeNull();
    expect((await asManager.raw('POST', '/month-sheet/lock', { month })).status).toBe(403);
    const hrId = await idOf(STAFF.hr.phone);
    expect((await asManager.raw('GET', `/month-sheet/${hrId}?month=${month}`)).status).toBe(403);
    const people = await asManager.raw<{ id: string; monthlyPayPaise?: number }[]>(
      'GET',
      '/people',
    );
    if (people.status === 200)
      expect(people.body.find((one) => one.id === p('worker').id)).not.toHaveProperty(
        'monthlyPayPaise',
      );

    const asWorker = await Session.code(p('worker').phone);
    expect((await sheetOf(asWorker)).status).toBe(403);
    expect(
      (await asWorker.raw('GET', `/month-sheet/${p('manager').id}?month=${month}`)).status,
    ).toBe(403);
    const mine = await asWorker.get<MonthSheetPerson>(`/me/month?month=${month}`);
    expect(mine.row.counts.payableDays).toBe(D - 3);
    expect(mine.row.money.grossPaise).toBe(grossOf(D - 3, D));

    const asAccounts = await Session.code(STAFF.accounts.phone);
    expect(rowOf((await sheetOf(asAccounts)).body)?.money.monthlyPayPaise).toBe(3_100_000);
  });

  it('exports CSV for Excel, with pay columns only for HR and finance', async () => {
    const file = await admin.download(`/month-sheet/export?month=${month}&format=csv`);
    expect(file.status).toBe(200);
    expect(file.type).toContain('text/csv');
    const text = file.bytes.toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const [header = '', ...lines] = text.slice(1).trim().split('\r\n');
    expect(header.split(',').slice(0, 3)).toEqual(['Employee ID', 'Name', 'Phone']);
    expect(header).toContain('Monthly pay (₹)');
    expect(header).toContain('Gross pay (₹)');
    const line = lines.find((one) => one.includes('Month Worker (test)')) ?? '';
    expect(line).toContain(p('worker').phone.slice(-5)); // "98765 43210": text in Excel
    expect(line).toContain(String(grossOf(D - 3, D) / 100));

    const asManager = await Session.code(p('manager').phone);
    const theirs = (await asManager.download(`/month-sheet/export?month=${month}&format=csv`)).bytes
      .toString('utf8')
      .trim()
      .split('\r\n');
    expect(theirs[0]).not.toContain('Monthly pay');
    expect(theirs[0]).not.toContain('Gross');
    expect(theirs).toHaveLength(2);
  });
});
