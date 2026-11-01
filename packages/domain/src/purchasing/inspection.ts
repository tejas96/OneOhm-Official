import { checkReceipt, type ReceiptProblem, roundQuantity } from '../inventory/stock-rules';

/**
 * Goods receipt inspection (PRD 3.10): units that fail inspection go back to the vendor.
 * They are not stocked or billed and stay due on the order, but they count as delivered
 * for the check that a delivery never exceeds what is still due.
 */
export type InspectionProblem = ReceiptProblem | 'rejected_not_whole' | 'over_delivered';

const EPSILON = 0.0005;

export function checkInspection(
  line: { readonly ordered: number; readonly received: number; readonly serialised: boolean },
  accepted: number,
  rejected: number,
): InspectionProblem | null {
  if (!(rejected > EPSILON)) return checkReceipt(line, accepted);
  if (accepted < -EPSILON) return 'not_positive';
  if (line.serialised && !Number.isInteger(rejected)) return 'rejected_not_whole';
  if (accepted > EPSILON) {
    const problem = checkReceipt(line, accepted);
    if (problem) return problem;
  }
  if (roundQuantity(line.received + accepted + rejected) - line.ordered > EPSILON) {
    return 'over_delivered';
  }
  return null;
}
