import type { EpcStage } from '../epc/stages';

/** The budget after the site survey (PRD 3.5, Flow A). */
export const BUDGET_STATUSES = ['awaiting_survey', 'locked', 'revision_needed', 'revised'] as const;
export type BudgetStatus = (typeof BUDGET_STATUSES)[number];

/** Why buying or dispatch is held: the survey price check, or a revision the customer must OK. */
export type BudgetHold = 'awaiting_survey' | 'revision_needed';

/** Work that spends money on material: buying, reserving and dispatching it. */
const SPENDING_STAGES: readonly EpcStage[] = ['material'];

/**
 * Material is bought only once the budget is locked (PRD 3.5, Flow F step 4): while the
 * survey price check is pending, or a revised quote waits for the customer, material
 * tasks are held. A project with no survey task never waits on one.
 */
export function budgetHold(
  stage: EpcStage,
  budgetStatus: string,
  hasSurvey: boolean,
): BudgetHold | null {
  if (!SPENDING_STAGES.includes(stage)) return null;
  if (budgetStatus === 'revision_needed') return 'revision_needed';
  if (budgetStatus === 'awaiting_survey' && hasSurvey) return 'awaiting_survey';
  return null;
}

/** What the task list says is holding the work. */
export const BUDGET_HOLD_REASON: Readonly<Record<BudgetHold, string>> = {
  awaiting_survey: 'Budget lock after the site survey is verified',
  revision_needed: 'Customer’s OK on the revised quotation',
};
