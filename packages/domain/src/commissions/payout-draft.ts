import { isMaskedAccount, type PayoutDetails, payoutDetailsProblems } from './payout-details';

/** How a reseller is paid: UPI, or a bank account. PAN is needed either way. */
export type PayoutMethod = 'upi' | 'bank';
export type PayoutField = keyof PayoutDetails;
export type PayoutProblems = Partial<Record<PayoutField, string>>;

/** The boxes of a payout form, plus the masked values the server sent for blank boxes. */
export interface PayoutDraft {
  readonly method: PayoutMethod;
  readonly values: Readonly<Record<PayoutField, string>>;
  readonly kept: Readonly<PayoutProblems>;
}

const FIELDS: readonly PayoutField[] = [
  'bankAccountName',
  'bankAccountNumber',
  'bankIfsc',
  'upiId',
  'pan',
];
const BANK: readonly PayoutField[] = ['bankAccountName', 'bankAccountNumber', 'bankIfsc'];

/** The fields the chosen way shows, PAN last. */
export const payoutFieldsFor = (method: PayoutMethod): readonly PayoutField[] =>
  method === 'upi' ? ['upiId', 'pan'] : [...BANK, 'pan'];

/** A fresh form from what is saved: masked values stay out of the boxes and are kept aside. */
export function payoutDraftFrom(saved: PayoutDetails | null): PayoutDraft {
  const values = {} as Record<PayoutField, string>;
  const kept: PayoutProblems = {};
  for (const field of FIELDS) {
    const value = saved?.[field] ?? null;
    if (isMaskedAccount(value)) kept[field] = value;
    values[field] = isMaskedAccount(value) ? '' : (value ?? '');
  }
  const hasBank = BANK.some((field) => saved?.[field]);
  return { method: hasBank && !saved?.upiId ? 'bank' : 'upi', values, kept };
}

/**
 * What to send: only the chosen way's fields (the other way's are cleared), and a blank box
 * sends its kept masked value back so the stored one stays.
 */
export function payoutPayloadOf(draft: PayoutDraft): PayoutDetails {
  const shown = payoutFieldsFor(draft.method);
  const payload = {} as Record<PayoutField, string | null>;
  for (const field of FIELDS) {
    const typed = draft.values[field].trim();
    payload[field] = shown.includes(field) ? typed || draft.kept[field] || null : null;
  }
  return payload;
}

/**
 * Missing or wrongly typed fields of the chosen way, as messages; empty when ready to save.
 * Formats use `payoutDetailsProblems`; `missing` words an empty field in the app's own copy.
 */
export function checkPayoutDraft(
  draft: PayoutDraft,
  missing: (field: PayoutField) => string,
): PayoutProblems {
  const payload = payoutPayloadOf(draft);
  const typed = { ...payload };
  for (const field of FIELDS) if (isMaskedAccount(typed[field])) typed[field] = null;
  const problems: PayoutProblems = payoutDetailsProblems(typed);
  for (const field of payoutFieldsFor(draft.method)) {
    if (!payload[field] && !problems[field]) problems[field] = missing(field);
  }
  return problems;
}
