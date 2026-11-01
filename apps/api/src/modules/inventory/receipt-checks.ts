import type { ReceiptData } from '@oneohm/api-contracts';
import { products, purchaseOrderLines, stockSerials, type Transaction } from '@oneohm/database';
import { checkInspection, checkSerials, dcrReceiptProblem, isSerialised } from '@oneohm/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { invalid } from '../../common/http/errors';

const RECEIPT_PROBLEM = {
  not_positive: 'Enter a quantity above 0.',
  not_whole: 'Panels, inverters and batteries arrive in whole units.',
  over_received: 'More than is still due on this order.',
  rejected_not_whole: 'Reject panels, inverters and batteries in whole units.',
  over_delivered: 'Accepted and rejected together are more than is still due.',
} as const;
const DCR_PROBLEM = {
  cell_manufacturer: {
    field: 'cellManufacturer',
    message: 'DCR panels need the cell maker, for the subsidy papers.',
  },
  cell_invoice: {
    field: 'cellInvoiceNumber',
    message: 'DCR panels need the GST invoice number of the cells.',
  },
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
  /** Failed inspection: sent back, not stocked or billed. */
  readonly rejectedQuantity: number;
  readonly rejectionReason: string | null;
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
      /** Panels tagged DCR need their cell maker and cell invoice at receipt. */
      dcr: products.dcr,
    })
    .from(purchaseOrderLines)
    .leftJoin(products, eq(products.id, purchaseOrderLines.productId))
    .where(eq(purchaseOrderLines.purchaseOrderId, orderId));
}

type Entry = ReceiptData['lines'][number];
/** A field and its problem, or the checked line. */
type LineResult = { readonly field: string; readonly message: string } | CheckedLine;

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
    const result = await checkLine(tx, entry, line);
    if ('field' in result) errors[`lines.${index}.${result.field}`] = result.message;
    else checked.push(result);
  }
  if (Object.keys(errors).length > 0) throw invalid('Some lines need fixing.', errors);
  return checked;
}

async function checkLine(tx: Transaction, entry: Entry, line: OrderLine): Promise<LineResult> {
  const serialised = line.category ? isSerialised(line.category) : false;
  const problem = checkInspection(
    { ordered: line.quantity, received: line.receivedQuantity, serialised },
    entry.quantity,
    entry.rejectedQuantity,
  );
  if (problem) {
    const field = problem === 'rejected_not_whole' ? 'rejectedQuantity' : 'quantity';
    return { field, message: RECEIPT_PROBLEM[problem] };
  }
  if (entry.rejectedQuantity > 0 && !entry.rejectionReason) {
    return { field: 'rejectionReason', message: 'Say why the units failed inspection.' };
  }
  const dcr = dcrReceiptProblem({ ...entry, category: line.category, dcr: line.dcr ?? false });
  if (dcr) return DCR_PROBLEM[dcr];
  let serials: string[] = [];
  if (serialised && line.productId && entry.quantity > 0) {
    const result = await checkLineSerials(tx, line.productId, entry);
    if (!Array.isArray(result)) return result;
    serials = result;
  }
  return {
    line,
    quantity: entry.quantity,
    serials,
    cellManufacturer: entry.cellManufacturer,
    cellInvoiceNumber: entry.cellInvoiceNumber,
    rejectedQuantity: entry.rejectedQuantity,
    rejectionReason: entry.rejectedQuantity > 0 ? entry.rejectionReason : null,
  };
}

/** One serial per accepted unit, none already in the books. */
async function checkLineSerials(
  tx: Transaction,
  productId: string,
  entry: Entry,
): Promise<string[] | { readonly field: string; readonly message: string }> {
  const result = checkSerials(entry.quantity, entry.serials);
  if ('problem' in result) return { field: 'serials', message: SERIAL_PROBLEM[result.problem] };
  const taken = await tx
    .select({ serial: stockSerials.serial })
    .from(stockSerials)
    .where(
      and(eq(stockSerials.productId, productId), inArray(stockSerials.serial, result.serials)),
    );
  if (taken.length > 0) {
    return {
      field: 'serials',
      message: `Already recorded: ${taken.map((row) => row.serial).join(', ')}.`,
    };
  }
  return result.serials;
}
