/** When late or stuck work is pushed up (PRD 3.7 escalation, 7.2 Settings). */
export interface EscalationPolicy {
  /** Days late before the project manager hears. */
  readonly managerAfterDays: number;
  /** Days late before everyone who manages projects (the owner) hears. */
  readonly ownersAfterDays: number;
  /** Days a task may wait on the OneOhm team before the manager hears. */
  readonly stuckInternalDays: number;
  /** Days a task may wait on the customer, bank or DISCOM before the manager hears. */
  readonly stuckOutsideDays: number;
}

export const DEFAULT_ESCALATION: EscalationPolicy = {
  managerAfterDays: 2,
  ownersAfterDays: 7,
  stuckInternalDays: 3,
  stuckOutsideDays: 14,
};

/** Problems with a policy, by field; empty when it can be saved. */
export function checkEscalationPolicy(policy: EscalationPolicy): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(policy)) {
    if (!Number.isInteger(value) || value < 1 || value > 90)
      errors[key] = 'Use a whole number of days from 1 to 90.';
  }
  if (!errors.ownersAfterDays && policy.ownersAfterDays <= policy.managerAfterDays)
    errors.ownersAfterDays = 'The owner hears after the manager, so use more days.';
  return errors;
}

/**
 * Who hears about a task this many days late: nobody yet, its manager, or the owners.
 * A template's own manager days move both steps, keeping the gap between them.
 */
export function lateEscalation(
  lateDays: number,
  policy: EscalationPolicy,
  templateManagerDays?: number | null,
): 'manager' | 'owners' | null {
  const manager = templateManagerDays ?? policy.managerAfterDays;
  const owners = manager + (policy.ownersAfterDays - policy.managerAfterDays);
  if (lateDays >= owners) return 'owners';
  if (lateDays >= manager) return 'manager';
  return null;
}

/** The earliest lateness that can alert anyone, for the daily query. */
export function earliestEscalationDays(
  policy: EscalationPolicy,
  templateDays: readonly (number | null)[],
): number {
  return Math.min(policy.managerAfterDays, ...templateDays.filter((day) => day !== null));
}
