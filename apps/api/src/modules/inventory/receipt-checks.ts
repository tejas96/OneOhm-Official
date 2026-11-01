import type { ReceiptData } from '@oneohm/api-contracts';
import { products, purchaseOrderLines, stockSerials, type Transaction } from '@oneohm/database';
import { checkReceipt, checkSerials, isSerialised } from '@oneohm/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { invalid } from '../../common/http/errors';

const RECEIPT_PROBLEM = {
  not_positive: 'Enter a quantity above 0.',
  not_whole: 'Panels, inverters and batteries arrive in whole units.',
  over_received: 'More than is still due on this order.',
} as const;
const SERIAL_PROBLEM = {
  count_mismatch: 'Enter one serial number per unit received.',
  blank: 'A serial number is blank.',
  duplicate: 'A serial number is repeated.',
} as const;

export type OrderLine = Awaited<ReturnType<typeof loadLines>>[number];
export interface CheckedLine {
  readonly line: OrderLine;
  readonly quantity: number;
  readonly serials: string[];
  readonly cellManufacturer: string | null;
  readonly cellInvoiceNumber: string | null;
}

export function loadLines(tx: Transaction, orderId: string) {
  return tx
    .select({
      id: purchaseOrderLines.id,
      productId: purchaseOrderLines.productId,
      description: purchaseOrderLines.description,
      quantity: purchaseOrderLines.quantity,
      receivedQuantity: purchaseOrderLines.receivedQuantity,
      ratePaise: purchaseOrderLines.ratePaise,
      taxRateBp: purchaseOrderLines.taxRateBp,
      category: products.category,
    })
    .from(purchaseOrderLines)
    .leftJoin(products, eq(products.id, purchaseOrderLines.productId))
    .where(eq(purchaseOrderLines.purchaseOrderId, orderId));
}

/** Every line checked before anything is written; all problems reported at once. */
export async function validateReceipt(
  tx: Transaction,
  input: ReceiptData,
  lines: readonly OrderLine[],
): Promise<CheckedLine[]> {
  const errors: Record<string, string> = {};
  const checked: CheckedLine[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of input.lines.entries()) {
    const line = lines.find((candidate) => candidate.id === entry.lineId);
    if (!line || seen.has(entry.lineId)) {
      errors[`lines.${index}.lineId`] = 'This line is not on the order.';
      continue;
    }
    seen.add(entry.lineId);
    const serialised = line.category ? isSerialised(line.category) : false;
    const problem = checkReceipt(
      { ordered: line.quantity, received: line.receivedQuantity, serialised },
      entry.quantity,
    );
    if (problem) {
      errors[`lines.${index}.quantity`] = RECEIPT_PROBLEM[problem];
      continue;
    }
    let serials: string[] = [];
    if (serialised && line.productId) {
      const result = checkSerials(entry.quantity, entry.serials);
      if ('problem' in result) {
        errors[`lines.${index}.serials`] = SERIAL_PROBLEM[result.problem];
        continue;
      }
      const taken = await tx
        .select({ serial: stockSerials.serial })
        .from(stockSerials)
        .where(
          and(
            eq(stockSerials.productId, line.productId),
            inArray(stockSerials.serial, result.serials),
          ),
        );
      if (taken.length > 0) {
        errors[`lines.${index}.serials`] =
          `Already recorded: ${taken.map((row) => row.serial).join(', ')}.`;
        continue;
      }
      serials = result.serials;
    }
    checked.push({
      line,
      quantity: entry.quantity,
      serials,
      cellManufacturer: entry.cellManufacturer,
      cellInvoiceNumber: entry.cellInvoiceNumber,
    });
  }
  if (Object.keys(errors).length > 0) throw invalid('Some lines need fixing.', errors);
  return checked;
}
