import { type Database, notify, notifyHolders, paymentHandling, payments } from '@oneohm/database';
import { CASH_HELD_ALERT_DAYS, daysHeld } from '@oneohm/domain';
import { addDays, formatInr } from '@oneohm/shared';
import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

const reversal = alias(payments, 'reversal');

/**
 * Cash collected and not deposited for more than a few days (PRD 3.11): the person
 * holding it is reminded, and finance gets one line on the total. Once a day each.
 */
export async function queueCashReminders(db: Database, today: string): Promise<number> {
  const cutoff = addDays(today, -CASH_HELD_ALERT_DAYS - 1);
  const rows = await db
    .select({
      holder: paymentHandling.collectedByUserId,
      amount: payments.amountPaise,
      receivedOn: payments.receivedOn,
    })
    .from(paymentHandling)
    .innerJoin(payments, eq(payments.id, paymentHandling.paymentId))
    .leftJoin(reversal, eq(reversal.reversesPaymentId, payments.id))
    .where(
      and(
        eq(paymentHandling.status, 'in_hand'),
        eq(payments.method, 'cash'),
        lte(payments.receivedOn, cutoff),
        isNull(reversal.id),
        sql`${payments.amountPaise} > 0`,
      ),
    );
  if (rows.length === 0) return 0;
  const byHolder = new Map<string, { total: number; oldest: number }>();
  for (const row of rows) {
    if (!row.holder) continue;
    const current = byHolder.get(row.holder) ?? { total: 0, oldest: 0 };
    byHolder.set(row.holder, {
      total: current.total + row.amount,
      oldest: Math.max(current.oldest, daysHeld(row.receivedOn, today)),
    });
  }
  for (const [userId, held] of byHolder) {
    await notify(
      db,
      { userId },
      {
        kind: 'cash_held',
        title: `Deposit ${formatInr(held.total)} cash`,
        body: `You have held customer cash for ${held.oldest} days. Pay it into the bank and hand the slip to accounts.`,
        dedupeKey: `cash_held:${userId}:${today}`,
      },
    );
  }
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  await notifyHolders(db, 'finance.record_payments', {
    kind: 'cash_held_summary',
    title: `${formatInr(total)} cash not deposited`,
    body: `Held more than ${CASH_HELD_ALERT_DAYS} days by ${byHolder.size || 1} ${byHolder.size === 1 ? 'person' : 'people'}. See Finance → Cash and cheques.`,
    dedupeKey: `cash_held_summary:${today}`,
  });
  return byHolder.size;
}
