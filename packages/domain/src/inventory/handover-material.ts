import { roundQuantity } from './stock-rules';

/**
 * Final material reconciliation before handover (PRD 3.17): every item issued to a
 * contractor for the project must be used or back in the store. A line still with a
 * contractor is unaccounted for and holds the handover until it is recorded, or until a
 * manager hands over anyway with a reason.
 */
export interface HandoverMaterialLine {
  readonly description: string;
  readonly unit: string;
  /** Issued less used less returned. */
  readonly withContractor: number;
}

const EPSILON = 0.0005;

/** The lines still unaccounted for, largest first. */
export function unaccountedMaterial<T extends HandoverMaterialLine>(lines: readonly T[]): T[] {
  return lines
    .filter((line) => Math.abs(line.withContractor) > EPSILON)
    .sort((left, right) => Math.abs(right.withContractor) - Math.abs(left.withContractor));
}

/** "DC cable: 12 m; MC4 connectors: 4 nos and 2 more" for a message. */
export function describeUnaccounted(lines: readonly HandoverMaterialLine[], shown = 3): string {
  const named = lines
    .slice(0, shown)
    .map((line) => `${line.description}: ${roundQuantity(line.withContractor)} ${line.unit}`)
    .join('; ');
  const more = lines.length - shown;
  return more > 0 ? `${named} and ${more} more` : named;
}

/** Why a manager handed over anyway: a real sentence, not a tick. */
export function overrideReasonProblem(reason: string | null | undefined): string | null {
  const text = reason?.trim() ?? '';
  if (text.length < 10) return 'Say in a sentence why the handover cannot wait.';
  return text.length > 500 ? 'Keep it under 500 characters.' : null;
}
