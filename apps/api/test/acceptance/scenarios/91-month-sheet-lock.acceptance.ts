import type { MonthSheet, MonthSheetPerson } from '@oneohm/api-contracts';
import { watchLockedMonths } from '@oneohm/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptanceDb, rows } from '../support/db';
import { Session } from '../support/http';
import { idOf, noticesOf, workDay } from '../support/month-sheet';
import {
  joinedLongAgo,
  type MonthSetUp,
  setUpMonth,
  tearDownMonth,
} from '../support/month-sheet-setup';
import { type OwnPerson, ownPerson } from '../support/people';
import { STAFF } from '../support/team';
import { indiaDate } from '../support/travel';

// Duty Day step 7, locking: a double click locks once and tells each worker once, with the
// month on the notice. A change after lock shows as "changed" (only what salary is made of)
// and HR hears of it once; Refresh row takes it in. Someone who qualifies after the lock is
// "not in the locked sheet" until HR adds the row; a frozen person who lost their role stays.
describe('Month sheet: lock', () => {
  let admin: Session;
  let set: MonthSetUp;
  let late: OwnPerson;
  let month = '';
  let D = 0;
  let W: string[] = [];
  const worker = () => set.worker.id;
  const rowOf = (sheet: MonthSheet, id = worker()) =>
    sheet.rows.find((row) => row.person.id === id);
  const sheet = () => admin.get<MonthSheet>(`/month-sheet?month=${month}`);

  beforeAll(async () => {
    admin = await Session.admin();
    set = await setUpMonth(admin, 'Lock');
    ({ month, D, W } = set);
  });
  afterAll(() => tearDownMonth(admin, set, late ? [late] : []));

  it('refuses a month still running, locks once on a double click and tells each worker once', async () => {
    const running = indiaDate().slice(0, 7);
    expect((await admin.raw('POST', '/month-sheet/lock', { month: running })).status).toBe(400);
    const [first, second] = await Promise.all([
      admin.raw<MonthSheet>('POST', '/month-sheet/lock', { month }),
      admin.raw<MonthSheet>('POST', '/month-sheet/lock', { month }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const locked = await sheet();
    expect(locked.status).toBe('locked');
    expect(rowOf(locked)?.frozenAt).not.toBeNull();
    const finals = await noticesOf(worker(), 'month_final');
    expect(finals).toHaveLength(1);
    expect(finals[0]?.title).toMatch(new RegExp(`final: ${D - 3} payable days$`));
    const [notice] = await rows<{ subject_month: string }>(
      "SELECT subject_month FROM notifications WHERE user_id = $1 AND kind = 'month_final'",
      [worker()],
    );
    expect(notice?.subject_month).toBe(month);
    const asWorker = await Session.code(set.worker.phone);
    const inbox = await asWorker.get<{ items: { kind: string; subject: { month?: string } }[] }>(
      '/me/notifications',
    );
    expect(inbox.items.find((item) => item.kind === 'month_final')?.subject.month).toBe(month);
  });

  it('a paid claim is not a change; a worked day is, and HR hears of it once', async () => {
    await rows(
      `WITH bill AS (
         INSERT INTO payables (party, party_name, party_user_id, description, amount_paise, due_on, status, paid_paise)
         VALUES ('employee', 'Lock Worker (test)', $1, 'Travel', 18000, $2, 'paid', 18000) RETURNING id)
       UPDATE travel_claims SET payable_id = (SELECT id FROM bill) WHERE user_id = $1 AND work_date = $2`,
      [worker(), W[11]],
    );
    expect(rowOf(await sheet())?.money.travelPaidPaise).toBe(42_000);
    expect(rowOf(await sheet())?.changes).toEqual([]);
    await workDay(worker(), W[3] as string, '09:30', '18:30');
    const row = rowOf(await sheet());
    expect(row?.counts.payableDays).toBe(D - 3);
    expect(row?.changes).toEqual(
      expect.arrayContaining([
        { field: 'present', before: W.length - 5, after: W.length - 4 },
        { field: 'payableDays', before: D - 3, after: D - 2 },
      ]),
    );
    expect(row?.changes.map((change) => change.field)).not.toContain('absent');
    expect(await watchLockedMonths(acceptanceDb().db)).toBeGreaterThan(0);
    expect(await watchLockedMonths(acceptanceDb().db)).toBe(0);
    const toHr = await noticesOf(await idOf(STAFF.hr.phone), 'month_row_changed');
    expect(toHr.filter((one) => one.dedupe_key.includes(worker()))).toHaveLength(1);
  });

  it('Refresh row takes the change in, with no pay amount in the audit', async () => {
    const fresh = await admin.post<MonthSheetPerson>(`/month-sheet/rows/${worker()}/refresh`, {
      month,
    });
    expect(fresh.row.counts.payableDays).toBe(D - 2);
    expect(fresh.row.changes).toEqual([]);
    const [audit] = await rows<{ data: { changes: { field: string; before?: number }[] } }>(
      "SELECT data FROM audit_log WHERE action = 'month_sheet.row_refreshed' AND entity_id = $1",
      [worker()],
    );
    const gross = audit?.data.changes.find((change) => change.field === 'grossPaise');
    expect(gross).toEqual({ field: 'grossPaise', changed: true });
  });

  it('someone who qualifies after the lock is shown apart until HR adds the row', async () => {
    late = await ownPerson(admin, 'Lock Late Joiner (test)', ['sales']);
    await joinedLongAgo([late.id], month);
    await workDay(late.id, W[0] as string, '09:30', '18:30');
    const outside = rowOf(await sheet(), late.id);
    expect(outside).toMatchObject({ inLock: false, frozenAt: null });
    const added = await admin.post<MonthSheetPerson>(`/month-sheet/rows/${late.id}/refresh`, {
      month,
    });
    expect(added.row).toMatchObject({ inLock: true });
    const audit = await rows(
      "SELECT 1 FROM audit_log WHERE action = 'month_sheet.row_added' AND entity_id = $1",
      [late.id],
    );
    expect(audit).toHaveLength(1);
  });

  it('a frozen person who lost their staff role stays on the locked sheet', async () => {
    await rows(
      "DELETE FROM user_roles WHERE user_id = $1 AND role_id IN (SELECT id FROM roles WHERE kind = 'staff')",
      [late.id],
    );
    const kept = rowOf(await sheet(), late.id);
    expect(kept).toMatchObject({ inLock: true });
    expect(kept?.counts.present).toBeGreaterThan(0);
  });

  it('unlocks only with a reason, kept in the history and the audit', async () => {
    expect((await admin.raw('POST', '/month-sheet/unlock', { month, reason: 'x' })).status).toBe(
      400,
    );
    const open = await admin.post<MonthSheet>('/month-sheet/unlock', {
      month,
      reason: 'Late correction from the site team',
    });
    expect(open.status).toBe('open');
    expect(open.unlocks.at(-1)?.reason).toBe('Late correction from the site team');
    expect(rowOf(open)?.frozenAt).toBeNull();
    // Once open, someone without a staff role is no longer on the sheet.
    expect(rowOf(open, late.id)).toBeUndefined();
    expect(
      (await admin.raw('POST', '/month-sheet/unlock', { month, reason: 'Again please' })).status,
    ).toBe(409);
  });
});
