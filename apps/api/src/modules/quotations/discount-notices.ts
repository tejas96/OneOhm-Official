import type { QuotationDetail } from '@oneohm/api-contracts';
import { type DatabaseExecutor, notify, notifyHolders, quotations } from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { eq } from 'drizzle-orm';

type AskedQuote = Pick<QuotationDetail, 'id' | 'number' | 'totals' | 'customer'>;

/**
 * A discount above the limit waits for an approver: tell those who can approve it, once per
 * quotation, so it does not sit unseen (the salesperson cannot send it until then).
 */
export async function askDiscountApproval(
  db: DatabaseExecutor,
  quote: AskedQuote,
  askedBy: { readonly userId: string; readonly fullName: string },
): Promise<void> {
  await notifyHolders(
    db,
    'quotations.approve_discount',
    {
      kind: 'discount_approval',
      title: `Approve a discount on ${quote.number}`,
      body: `${askedBy.fullName} gives ${quote.customer.name} ${formatInr(quote.totals.discountPaise)} off. It cannot go to the customer until someone approves it.`,
      subject: { type: 'quotation', id: quote.id },
      dedupeKey: `discount_ask:${quote.id}`,
    },
    askedBy.userId,
  );
}

/** The person who made the quotation hears that its discount is approved and it can go out. */
export async function tellDiscountApproved(
  db: DatabaseExecutor,
  quotationId: string,
  approverId: string,
): Promise<void> {
  const [row] = await db
    .select({ number: quotations.number, createdBy: quotations.createdByUserId })
    .from(quotations)
    .where(eq(quotations.id, quotationId));
  if (!row?.createdBy || row.createdBy === approverId) return;
  await notify(
    db,
    { userId: row.createdBy },
    {
      kind: 'discount_approved',
      title: `Discount approved on ${row.number}`,
      body: 'You can send the quotation to the customer now.',
      subject: { type: 'quotation', id: quotationId },
      dedupeKey: `discount_ok:${quotationId}`,
    },
  );
}
