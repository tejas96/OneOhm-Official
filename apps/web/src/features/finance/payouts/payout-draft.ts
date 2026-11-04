import type { PayoutDetailsInput } from '@oneohm/api-contracts';
import { type PayoutDetails, payoutDetailsProblems } from '@oneohm/domain';

export type PayoutMethod = 'upi' | 'bank';
export type PayoutField = keyof PayoutDetails;
export type PayoutProblems = Partial<Record<PayoutField, string>>;

/** The boxes of the payout form, plus any masked values the server sent for blank boxes. */
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

/** A value the server masked (`••••1234`); sending it back unchanged keeps what is stored. */
const isMasked = (value: string | null): value is string => Boolean(value?.startsWith('••••'));

/** The fields the chosen way shows, PAN last. */
export const fieldsFor = (method: PayoutMethod): readonly PayoutField[] =>
  method === 'upi' ? ['upiId', 'pan'] : [...BANK, 'pan'];

/** A fresh form from what is saved: masked values stay out of the boxes. */
export function draftFrom(saved: PayoutDetails | null): PayoutDraft {
  const values = {} as Record<PayoutField, string>;
  const kept: PayoutProblems = {};
  for (const field of FIELDS) {
    const value = saved?.[field] ?? null;
    if (isMasked(value)) kept[field] = value;
    values[field] = isMasked(value) ? '' : (value ?? '');
  }
  const hasBank = BANK.some((field) => saved?.[field]);
  return { method: hasBank && !saved?.upiId ? 'bank' : 'upi', values, kept };
}

/** What the boxes say, with only the chosen way's fields; blanks keep a masked saved value. */
export function payloadOf(draft: PayoutDraft): PayoutDetailsInput {
  const shown = fieldsFor(draft.method);
  const payload = {} as Record<PayoutField, string | null>;
  for (const field of FIELDS) {
    const typed = draft.values[field].trim();
    payload[field] = shown.includes(field) ? typed || draft.kept[field] || null : null;
  }
  return payload;
}

/** Missing or wrongly typed fields of the chosen way; `missing` words the empty ones. */
export function checkDraft(
  draft: PayoutDraft,
  missing: (field: PayoutField) => string,
): PayoutProblems {
  const payload = payloadOf(draft);
  const typed = { ...payload };
  for (const field of FIELDS) if (isMasked(typed[field])) typed[field] = null;
  const problems: PayoutProblems = payoutDetailsProblems(typed);
  for (const field of fieldsFor(draft.method)) {
    if (!payload[field] && !problems[field]) problems[field] = missing(field);
  }
  return problems;
}
