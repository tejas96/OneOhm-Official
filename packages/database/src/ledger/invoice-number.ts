import { invoicePrefix, nextInvoiceNumberAfter } from '@oneohm/domain';
import { sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client';

/**
 * The next tax invoice number in the financial year of the invoice date:
 * OH/INV/2026-27/0001. Serialised with a lock and counted over every invoice of the
 * year, cancelled ones included, so the series never has a gap or a repeat.
 * Call it inside the transaction that writes the invoice.
 */
export async function nextInvoiceNumber(
  db: DatabaseExecutor,
  invoiceDate: string,
): Promise<string> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext('oneohm:invoice'))`);
  const prefix = invoicePrefix(invoiceDate);
  // Numeric order, so 10000 sorts after 9999.
  const result = await db.execute<{ number: string }>(
    sql`select number from customer_invoices where number like ${`${prefix}%`}
        order by length(number) desc, number desc limit 1`,
  );
  return nextInvoiceNumberAfter(invoiceDate, result.rows[0]?.number ?? null);
}
