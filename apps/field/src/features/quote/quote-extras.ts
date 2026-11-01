import type { ExtraLineInput } from '@oneohm/api-contracts';
import { type ExtraKind, extraNeedsReason } from '@oneohm/domain';

/** What the "Add an extra" sheet holds, as typed. */
export interface ExtraForm {
  readonly kind: ExtraKind;
  readonly description: string;
  /** Rupees: the price for an item or charge, the amount of an adjustment. */
  readonly amount: string;
  /** Rupees: what a gift or charge costs OneOhm. */
  readonly cost: string;
  readonly lowers: boolean;
  readonly reason: string;
}

export const EMPTY_EXTRA_FORM: ExtraForm = {
  kind: 'gift',
  description: '',
  amount: '',
  cost: '',
  lowers: true,
  reason: '',
};

export type ExtraProblem = 'description' | 'amount' | 'cost' | 'reason';

const rupees = (text: string): number | null => {
  if (text.trim() === '') return 0;
  const value = Number(text.replace(/[,\s₹]/g, ''));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
};

export const takesAmount = (kind: ExtraKind) => kind !== 'gift';
export const takesCost = (kind: ExtraKind) => kind === 'gift' || kind === 'charge';

/** The line to price, or the fields to fix first. Anything but an optional item needs a reason. */
export function extraFromForm(
  form: ExtraForm,
): { readonly line: ExtraLineInput } | { readonly problems: readonly ExtraProblem[] } {
  const amount = rupees(form.amount);
  const cost = rupees(form.cost);
  const problems: ExtraProblem[] = [];
  if (form.description.trim().length < 2) problems.push('description');
  if (amount === null || (form.kind === 'adjustment' && amount === 0)) problems.push('amount');
  if (cost === null) problems.push('cost');
  if (extraNeedsReason(form.kind) && form.reason.trim().length < 3) problems.push('reason');
  if (problems.length > 0 || amount === null || cost === null) return { problems };
  const lowered = form.kind === 'adjustment' && form.lowers;
  return {
    line: {
      kind: form.kind,
      productId: null,
      description: form.description.trim(),
      quantity: 1,
      unit: form.kind === 'adjustment' || form.kind === 'charge' ? 'job' : 'nos',
      unitPricePaise: takesAmount(form.kind) ? (lowered ? -amount : amount) : 0,
      unitCostPaise: takesCost(form.kind) ? cost : 0,
      reason: form.reason.trim(),
    },
  };
}
