import { financialYear } from '@oneohm/domain';
import { sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client';

/**
 * The next receipt number in the financial year of the day the money arrived:
 * OH/RCPT/2026-27/0001. Serialised with a lock, so two receipts never share a number.
 * Call it inside the transaction that records the payment.
 */
export async function nextReceiptNumber(db: DatabaseExecutor, receivedOn: string): Promise<string> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext('oneohm:receipt'))`);
  const base = `OH/RCPT/${financialYear(receivedOn)}/`;
  const result = await db.execute<{ receipt_number: string }>(
    sql`select receipt_number from payments where receipt_number like ${`${base}%`} order by receipt_number desc limit 1`,
  );
  const last = result.rows[0]?.receipt_number;
  const next = last ? Number(last.slice(base.length)) + 1 : 1;
  return `${base}${String(next).padStart(4, '0')}`;
}
