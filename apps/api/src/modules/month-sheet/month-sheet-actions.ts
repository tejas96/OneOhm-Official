import {
  type Database,
  liveMonth,
  monthName,
  monthSheetRows,
  monthSheets,
  notify,
} from '@oneohm/database';
import { isAmber, MONTH_FLAG_KINDS, type MonthDiff, monthRowDiff } from '@oneohm/domain';
import { addDays, monthRange } from '@oneohm/shared';
import { and, eq, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { readSheet } from './month-sheet-store';

const days = (value: number) => `${value} payable ${value === 1 ? 'day' : 'days'}`;

/** A month may be locked from the day after its last day: every day of it is over. */
export const lockableOn = (month: string) => addDays(monthRange(month).end, 1);

/** What changed, for the audit log: never a pay or gross amount, only that it moved. */
const auditable = (changes: readonly MonthDiff[]) =>
  changes.map((change) =>
    change.field === 'grossPaise' ? { field: change.field, changed: true } : change,
  );

/**
 * Lock month, in one transaction: the sheet moves from open to locked only if it is open now
 * (a second click or a second HR finds it locked: 409, nothing frozen or told again). Every
 * row is frozen as the facts say now and each person is told their month is final, once per
 * lock. Amber rows do not block (a person decided); the audit keeps how many there were.
 */
export async function lockMonth(db: Database, actor: Actor, month: string, today: string) {
  assertCan(actor, 'people.manage');
  if (today < lockableOn(month))
    throw invalid(`${monthName(month)} can be locked from ${lockableOn(month)}.`, {
      month: 'Still running.',
    });
  const live = await liveMonth(db, month, today);
  const now = new Date();
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(monthSheets)
      .values({ month, status: 'locked', lockedBy: actor.userId, lockedAt: now })
      .onConflictDoUpdate({
        target: monthSheets.month,
        set: { status: 'locked', lockedBy: actor.userId, lockedAt: now, updatedAt: now },
        setWhere: eq(monthSheets.status, 'open'),
      })
      .returning({ id: monthSheets.id, unlocks: monthSheets.unlocks });
    if (!row) throw conflict(`${monthName(month)} is already locked.`, 'locked');
    // One key per lock of the month: the nth lock after n − 1 unlocks.
    const lockKey = `${month}:${row.id}:${row.unlocks.length}`;
    await tx.delete(monthSheetRows).where(eq(monthSheetRows.sheetId, row.id));
    const frozen = [...live.rows.values()];
    if (frozen.length > 0)
      await tx.insert(monthSheetRows).values(
        frozen.map((breakdown) => ({
          sheetId: row.id,
          userId: breakdown.userId,
          breakdown,
          frozenAt: now,
        })),
      );
    for (const breakdown of frozen)
      await notify(
        tx,
        { userId: breakdown.userId },
        {
          kind: 'month_final',
          title: `Your ${monthName(month)} sheet is final: ${days(breakdown.counts.payableDays)}`,
          body: 'Open My month to see each day, your travel and bonuses.',
          subject: { type: 'month_sheet', id: breakdown.userId, month },
          dedupeKey: `month_final:${lockKey}:${breakdown.userId}`,
        },
      );
    const amber = frozen.filter(isAmber);
    await recordAudit(tx, actor.userId, 'month_sheet.locked', 'month_sheet', row.id, {
      month,
      rows: frozen.length,
      amberRows: amber.length,
      amberPeople: amber.map((one) => one.userId),
      flagKinds: MONTH_FLAG_KINDS.filter((kind) =>
        amber.some((one) => one.flags.some((flag) => flag.kind === kind)),
      ),
    });
  });
}

/** Unlock month, with a reason kept in the sheet's history and the audit log. */
export async function unlockMonth(db: Database, actor: Actor, month: string, reason: string) {
  assertCan(actor, 'people.manage');
  const entry = { at: new Date().toISOString(), byUserId: actor.userId, reason };
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(monthSheets)
      .set({
        status: 'open',
        unlocks: sql`${monthSheets.unlocks} || ${JSON.stringify([entry])}::jsonb`,
        updatedAt: new Date(),
      })
      .where(and(eq(monthSheets.month, month), eq(monthSheets.status, 'locked')))
      .returning({ id: monthSheets.id });
    if (!row) throw conflict(`${monthName(month)} is not locked.`, 'not_locked');
    await recordAudit(tx, actor.userId, 'month_sheet.unlocked', 'month_sheet', row.id, {
      month,
      reason,
    });
  });
}

/**
 * Refresh row: one locked row frozen again from the facts now. For someone who qualifies now
 * but is not in the locked sheet, it adds their row. The audit keeps what changed (no pay).
 */
export async function refreshRow(
  db: Database,
  actor: Actor,
  month: string,
  userId: string,
  today: string,
) {
  assertCan(actor, 'people.manage');
  const sheet = await readSheet(db, month);
  if (sheet.status !== 'locked' || !sheet.id)
    throw conflict(`${monthName(month)} is not locked; its rows are already live.`, 'not_locked');
  const sheetId = sheet.id;
  const live = await liveMonth(db, month, today, [userId]);
  const breakdown = live.rows.get(userId);
  if (!breakdown) throw notFound('That person’s month');
  const [old] = await db
    .select({ breakdown: monthSheetRows.breakdown })
    .from(monthSheetRows)
    .where(and(eq(monthSheetRows.sheetId, sheetId), eq(monthSheetRows.userId, userId)));
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(monthSheetRows)
      .values({ sheetId, userId, breakdown, frozenAt: now, refreshedBy: actor.userId })
      .onConflictDoUpdate({
        target: [monthSheetRows.sheetId, monthSheetRows.userId],
        set: { breakdown, frozenAt: now, refreshedBy: actor.userId, toldChange: null },
      });
    const action = old ? 'month_sheet.row_refreshed' : 'month_sheet.row_added';
    await recordAudit(tx, actor.userId, action, 'user', userId, {
      month,
      changes: old ? auditable(monthRowDiff(old.breakdown, breakdown)) : [],
    });
  });
}
