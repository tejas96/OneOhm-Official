import type { MilestoneShare } from './payment-milestones';

/** Events a customer milestone can wait for; the bank's share always waits for disbursement. */
export const CUSTOMER_TRIGGERS = [
  'quotation_accepted',
  'material_dispatch',
  'commissioning_completed',
] as const;

const FULL_BP = 10_000;

/** A stable key from a label: "Before dispatch" → "before_dispatch". */
export function stepKey(label: string, index: number): string {
  const words = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return words || `step_${index + 1}`;
}

/**
 * Problems with a plan, keyed like form fields (`steps.1.shareBp`), or none. Shares must
 * be positive and add up to exactly 100%, and each step needs a name and a known event.
 */
export function checkPaymentPlan(steps: readonly MilestoneShare[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (steps.length === 0) errors.steps = 'Add at least one payment.';
  if (steps.length > 8) errors.steps = 'Use at most 8 payments.';
  steps.forEach((step, index) => {
    if (!step.label.trim()) errors[`steps.${index}.label`] = 'Name this payment.';
    if (!(step.shareBp > 0)) errors[`steps.${index}.shareBp`] = 'More than 0%.';
    if (!(CUSTOMER_TRIGGERS as readonly string[]).includes(step.trigger))
      errors[`steps.${index}.trigger`] = 'Pick when it falls due.';
  });
  const total = steps.reduce((sum, step) => sum + step.shareBp, 0);
  if (steps.length > 0 && total !== FULL_BP)
    errors.total = `The shares add up to ${total / 100}%; they must make 100%.`;
  const keys = steps.map((step, index) => stepKey(step.label, index));
  if (new Set(keys).size !== keys.length) errors.steps = 'Give each payment a different name.';
  return errors;
}
