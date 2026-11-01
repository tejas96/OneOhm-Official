/**
 * DCR panels at goods receipt (PRD 3.10). A panel tagged DCR (domestic content) earns the
 * subsidy only with proof its cells were made in India, so the store records who made
 * the cells and the GST invoice they came on for every DCR panel received.
 */
export type DcrReceiptProblem = 'cell_manufacturer' | 'cell_invoice';

/** Whether a received line needs its cell details: DCR panels with units accepted. */
export function needsCellDetails(line: {
  readonly category: string | null;
  readonly dcr: boolean;
  readonly quantity: number;
}): boolean {
  return line.category === 'panel' && line.dcr && line.quantity > 0;
}

/** The first missing cell detail on a DCR panel line, or null when it is complete. */
export function dcrReceiptProblem(line: {
  readonly category: string | null;
  readonly dcr: boolean;
  readonly quantity: number;
  readonly cellManufacturer: string | null;
  readonly cellInvoiceNumber: string | null;
}): DcrReceiptProblem | null {
  if (!needsCellDetails(line)) return null;
  if (!line.cellManufacturer?.trim()) return 'cell_manufacturer';
  if (!line.cellInvoiceNumber?.trim()) return 'cell_invoice';
  return null;
}
