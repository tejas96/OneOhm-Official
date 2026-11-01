/**
 * How new work finds a person (PRD 3.8, 7.2 "assignment rules"). Owners change them in
 * Settings; the defaults are how OneOhm has always assigned.
 */
export const ASSIGNMENT_STRATEGIES = ['least_busy', 'round_robin'] as const;
export type AssignmentStrategy = (typeof ASSIGNMENT_STRATEGIES)[number];

export interface AssignmentRules {
  /** Least busy: fewest open tasks. Round robin: whoever got work longest ago. */
  readonly strategy: AssignmentStrategy;
  /** Skip people on approved leave during the task's days. */
  readonly skipLeave: boolean;
  /** Give the task to someone with the template's skill first. */
  readonly preferSkill: boolean;
  /** Try the project's named team before the rest of the company. */
  readonly teamFirst: boolean;
}

export const DEFAULT_ASSIGNMENT_RULES: AssignmentRules = {
  strategy: 'least_busy',
  skipLeave: true,
  preferSkill: true,
  teamFirst: true,
};

/** True when the saved rules are complete and known. */
export function isAssignmentRules(value: unknown): value is AssignmentRules {
  if (!value || typeof value !== 'object') return false;
  const rules = value as Record<string, unknown>;
  return (
    ASSIGNMENT_STRATEGIES.includes(rules.strategy as AssignmentStrategy) &&
    typeof rules.skipLeave === 'boolean' &&
    typeof rules.preferSkill === 'boolean' &&
    typeof rules.teamFirst === 'boolean'
  );
}
