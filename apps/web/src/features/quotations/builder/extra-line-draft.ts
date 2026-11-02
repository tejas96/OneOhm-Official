import type { ExtraLineInput, Product } from '@oneohm/api-contracts';
import { asUnit, EXTRA_KINDS, type ExtraKind, type Unit } from '@oneohm/domain';
import { rupeesToPaise } from '@oneohm/shared';

export type { ExtraKind };
export { EXTRA_KINDS };

/** What the "Add a line" sheet holds, as typed. */
export interface ExtraDraft {
  readonly kind: ExtraKind;
  readonly productId: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unit: Unit;
  /** Rupees per unit; for an adjustment, the amount before GST. */
  readonly price: string;
  readonly cost: string;
  /** Adjustments only: lower or raise the price. */
  readonly lowers: boolean;
  readonly reason: string;
}

export const EMPTY_EXTRA: ExtraDraft = {
  kind: 'optional',
  productId: null,
  description: '',
  quantity: '1',
  unit: 'nos',
  price: '',
  cost: '',
  lowers: true,
  reason: '',
};

/** Picking a catalog product fills its name, unit, price and cost. */
export function withProduct(draft: ExtraDraft, product: Product | undefined): ExtraDraft {
  if (!product) return { ...draft, productId: null };
  const name =
    product.brand === 'Starter catalog' ? product.name : `${product.brand} ${product.name}`;
  return {
    ...draft,
    productId: product.id,
    description: name,
    unit: asUnit(product.unit),
    price: String(product.pricePaise / 100),
    cost: String(product.costPaise / 100),
  };
}

/** Catalog picks only make sense for items: not for charges or adjustments. */
export const takesProduct = (kind: ExtraKind) => kind === 'optional' || kind === 'gift';
export const takesReason = (kind: ExtraKind) => kind !== 'optional';
export const takesPrice = (kind: ExtraKind) => kind === 'optional' || kind === 'charge';
export const takesCost = (kind: ExtraKind) => kind === 'gift' || kind === 'charge';

export type ExtraDraftError = 'description' | 'quantity' | 'price' | 'cost' | 'reason';

const amount = (text: string): number | null => {
  if (text.trim() === '') return 0;
  const value = Number(text.replace(/[,\s₹]/g, ''));
  return Number.isFinite(value) && value >= 0 ? value : null;
};

interface Numbers {
  readonly quantity: number;
  readonly price: number | null;
  readonly cost: number | null;
}

/** The fields that still need fixing before the line can be added. */
function problems(draft: ExtraDraft, numbers: Numbers): ExtraDraftError[] {
  const { quantity, price, cost } = numbers;
  const checks: readonly [ExtraDraftError, boolean][] = [
    ['description', draft.description.trim().length < 2],
    ['quantity', !Number.isFinite(quantity) || quantity <= 0],
    ['price', price === null || (draft.kind === 'adjustment' && price === 0)],
    ['cost', cost === null],
    ['reason', takesReason(draft.kind) && draft.reason.trim().length < 3],
  ];
  return checks.filter(([, failed]) => failed).map(([field]) => field);
}

/** The line for the quotation input, or the fields still to fix. */
export function extraFromDraft(
  draft: ExtraDraft,
): { readonly line: ExtraLineInput } | { readonly errors: readonly ExtraDraftError[] } {
  const quantity = draft.kind === 'adjustment' ? 1 : Number(draft.quantity);
  const price = amount(draft.price);
  const cost = amount(draft.cost);
  const errors = problems(draft, { quantity, price, cost });
  if (errors.length > 0 || price === null || cost === null) return { errors };
  const signed = draft.kind === 'adjustment' && draft.lowers ? -price : price;
  const adjustment = draft.kind === 'adjustment';
  return {
    line: {
      kind: draft.kind,
      productId: takesProduct(draft.kind) ? draft.productId : null,
      description: draft.description.trim(),
      quantity,
      unit: adjustment ? 'job' : draft.unit,
      unitPricePaise: draft.kind === 'gift' ? 0 : rupeesToPaise(signed),
      unitCostPaise: takesCost(draft.kind) ? rupeesToPaise(cost) : 0,
      reason: draft.reason.trim(),
    },
  };
}
