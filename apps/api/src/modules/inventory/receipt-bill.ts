import type { ReceiptData } from '@oneohm/api-contracts';
import { payables, type purchaseOrders, type Transaction, type vendors } from '@oneohm/database';
import { purchaseOrderTotals } from '@oneohm/domain';
import { addDays } from '@oneohm/shared';
import type { CheckedLine } from './receipt-checks';

/** What the accepted goods cost at the order's rates: amount with GST, and the GST in it. */
export function receiptAmounts(checked: readonly CheckedLine[]) {
  const totals = purchaseOrderTotals(
    checked.map((row) => ({
      quantity: row.quantity,
      ratePaise: row.line.ratePaise,
      taxRateBp: row.line.taxRateBp,
    })),
  );
  return { amountPaise: totals.totalPaise, gstPaise: totals.taxPaise };
}

/**
 * The vendor's bill for what was accepted, due after their terms; none if nothing was.
 * It carries the vendor's own invoice total, so the approver sees any mismatch with the
 * order, and the GST in it, so TDS is worked out on the value before GST.
 */
export async function raiseBill(
  tx: Transaction,
  context: {
    readonly number: string;
    readonly order: typeof purchaseOrders.$inferSelect;
    readonly vendor: typeof vendors.$inferSelect;
    readonly input: ReceiptData;
    readonly amountPaise: number;
    readonly gstPaise: number;
  },
): Promise<string | null> {
  const { number, order, vendor, input, amountPaise, gstPaise } = context;
  if (amountPaise <= 0) return null;
  const invoice = input.vendorInvoiceNumber ? ` · invoice ${input.vendorInvoiceNumber}` : '';
  const [payable] = await tx
    .insert(payables)
    .values({
      projectId: order.projectId,
      party: 'vendor',
      partyName: vendor.name,
      description: `${number} against ${order.number}${invoice}`,
      billNumber: input.vendorInvoiceNumber ?? null,
      amountPaise,
      gstPaise,
      vendorInvoicePaise: input.vendorInvoicePaise,
      dueOn: addDays(input.receivedOn, vendor.paymentTermsDays),
    })
    .returning({ id: payables.id });
  return payable?.id ?? null;
}
