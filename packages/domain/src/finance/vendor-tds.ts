import { isValidPan } from './tds';

/**
 * The lowest TDS rate a vendor bill may carry when the vendor has no valid PAN
 * (Income-tax Act 2025, section 397(2), from 1 April 2026): the higher of the normal
 * rate and 20%, but 5% in specified cases, which include buying goods (the old 194Q).
 */
export const NO_PAN_GOODS_MIN_BP = 500;
export const NO_PAN_SERVICES_MIN_BP = 2000;

/** What the bill is for: goods from a goods receipt, or anything else (services). */
export type VendorBillKind = 'goods' | 'services';

export const noPanMinimumBp = (kind: VendorBillKind): number =>
  kind === 'goods' ? NO_PAN_GOODS_MIN_BP : NO_PAN_SERVICES_MIN_BP;

/** The PAN inside a GSTIN: characters 3 to 12. Empty when the GSTIN is not well formed. */
export function panFromGstin(gstin: string | null | undefined): string {
  const value = (gstin ?? '').trim().toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(value)) return '';
  const pan = value.slice(2, 12);
  return isValidPan(pan) ? pan : '';
}

/** The vendor's own PAN, else the one in their GSTIN, else null. */
export function vendorPan(
  pan: string | null | undefined,
  gstin: string | null | undefined,
): string | null {
  if (isValidPan(pan)) return (pan as string).trim().toUpperCase();
  return panFromGstin(gstin) || null;
}

/** Null when `tdsBp` is allowed for a vendor with this PAN; else the lowest rate allowed. */
export function vendorTdsShortfall(input: {
  readonly tdsBp: number;
  readonly kind: VendorBillKind;
  readonly pan: string | null | undefined;
  readonly gstin: string | null | undefined;
}): number | null {
  if (input.tdsBp <= 0 || vendorPan(input.pan, input.gstin)) return null;
  const minimum = noPanMinimumBp(input.kind);
  return input.tdsBp < minimum ? minimum : null;
}
