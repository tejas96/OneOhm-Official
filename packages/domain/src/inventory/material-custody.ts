import type { LineCategory } from '../pricing/quote-pricing';
import { roundQuantity } from './stock-rules';

/**
 * Material with contractors (PRD 3.10, 3.13): the store issues material to a contractor
 * for a project, the crew uses it, and what is left comes back to the store. What a
 * contractor holds is always issued less used less returned, per project and item.
 */
export const CUSTODY_KINDS = ['issue', 'use', 'return'] as const;
export type CustodyKind = (typeof CUSTODY_KINDS)[number];

/** Quotation lines that are goods from the store; labour, transport and DISCOM work are not. */
export const MATERIAL_CATEGORIES: readonly LineCategory[] = [
  'panel',
  'inverter',
  'battery',
  'structure',
  'cable',
  'electrical',
  'other',
];
export const isMaterialCategory = (category: LineCategory): boolean =>
  MATERIAL_CATEGORIES.includes(category);

const EPSILON = 0.0005;

export interface CustodyEntry {
  readonly kind: CustodyKind;
  readonly quantity: number;
}

export interface CustodyTotals {
  readonly issued: number;
  readonly used: number;
  readonly returned: number;
  /** Still with the contractor: issued less used less returned. */
  readonly balance: number;
}

/** Issued, used, returned and what is still with the contractor. */
export function custodyTotals(entries: readonly CustodyEntry[]): CustodyTotals {
  const sum = (kind: CustodyKind) =>
    roundQuantity(
      entries
        .filter((entry) => entry.kind === kind)
        .reduce((total, entry) => total + entry.quantity, 0),
    );
  const issued = sum('issue');
  const used = sum('use');
  const returned = sum('return');
  return { issued, used, returned, balance: roundQuantity(issued - used - returned) };
}

export type DrawProblem = 'not_positive' | 'more_than_held' | 'not_whole';

/** Whether `quantity` can be recorded as used or returned from what the contractor holds. */
export function checkDraw(held: number, quantity: number, serialised: boolean): DrawProblem | null {
  if (!(quantity > EPSILON)) return 'not_positive';
  if (serialised && !Number.isInteger(quantity)) return 'not_whole';
  if (roundQuantity(quantity) - held > EPSILON) return 'more_than_held';
  return null;
}

export type ReconciliationWarning = 'unaccounted' | 'over_used';

export interface ReconciliationInput {
  readonly needed: number;
  readonly issued: number;
  readonly used: number;
  readonly returned: number;
  /** Installation is finished: everything issued should now be used or back in store. */
  readonly installed: boolean;
}

export interface ReconciledLine {
  /** Still with a contractor: issued less used less returned. */
  readonly withContractor: number;
  /** Used against the quotation: positive is more than quoted, negative less. */
  readonly difference: number;
  readonly warning: ReconciliationWarning | null;
}

/**
 * One quotation line reconciled. After installation, material still with a contractor
 * (issued less used less returned is not zero) is unaccounted for; using more than the
 * quotation allows is flagged too.
 */
export function reconcileLine(input: ReconciliationInput): ReconciledLine {
  const withContractor = roundQuantity(input.issued - input.used - input.returned);
  const difference = roundQuantity(input.used - input.needed);
  const warning = !input.installed
    ? null
    : Math.abs(withContractor) > EPSILON
      ? 'unaccounted'
      : difference > EPSILON
        ? 'over_used'
        : null;
  return { withContractor, difference, warning };
}

/** Installation is done when every installation-stage task is completed. */
export function installationFinished(
  tasks: readonly { readonly stage: string; readonly status: string }[],
): boolean {
  const installation = tasks.filter((task) => task.stage === 'installation');
  return installation.length > 0 && installation.every((task) => task.status === 'completed');
}
