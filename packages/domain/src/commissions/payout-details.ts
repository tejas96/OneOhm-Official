/** Where a reseller's commission is paid. Finance needs PAN plus UPI or full bank details. */
export interface PayoutDetails {
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  upiId: string | null;
  pan: string | null;
}

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_PATTERN = /^[\w.-]{2,}@[a-zA-Z]{2,}$/;
const ACCOUNT_PATTERN = /^[0-9]{9,18}$/;

const clean = (value: string | null): string => (value ?? '').trim().toUpperCase();
const isSet = (value: string | null): boolean => clean(value) !== '';

/** True when finance can pay: a PAN, and either a UPI ID or the full bank details. */
export function payoutDetailsComplete(d: PayoutDetails | null): boolean {
  if (!d || !isSet(d.pan)) return false;
  const bankComplete = isSet(d.bankAccountName) && isSet(d.bankAccountNumber) && isSet(d.bankIfsc);
  return isSet(d.upiId) || bankComplete;
}

const MASK = '••••';

/** Shows only the last 4 characters. Values shorter than 4 are fully kept after the mask. */
export function maskAccount(value: string | null): string | null {
  if (value === null) return null;
  return `${MASK}${value.slice(-4)}`;
}

/** True for a value `maskAccount` produced; sent back unchanged, it keeps what is stored. */
export function isMaskedAccount(value: string | null | undefined): value is string {
  return Boolean(value?.startsWith(MASK));
}

/** Format problems per field, after trimming and uppercasing. Empty fields are not problems. */
export function payoutDetailsProblems(
  d: PayoutDetails,
): Partial<Record<keyof PayoutDetails, string>> {
  const problems: Partial<Record<keyof PayoutDetails, string>> = {};
  const check = (
    field: 'pan' | 'bankIfsc' | 'upiId' | 'bankAccountNumber',
    pattern: RegExp,
    message: string,
  ) => {
    if (isSet(d[field]) && !pattern.test(clean(d[field]))) problems[field] = message;
  };
  check('pan', PAN_PATTERN, 'PAN must look like ABCDE1234F');
  check('bankIfsc', IFSC_PATTERN, 'IFSC must be 4 letters, 0, then 6 letters or digits');
  check('upiId', UPI_PATTERN, 'UPI ID must look like name@bank');
  check('bankAccountNumber', ACCOUNT_PATTERN, 'Account number must be 9 to 18 digits');
  return problems;
}
