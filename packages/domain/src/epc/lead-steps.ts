import type { LeadStage } from './stages';

/** Lead stages a lead moves through before it is won or lost; steps sit inside them. */
export const OPEN_LEAD_STAGES = [
  'new',
  'contacted',
  'survey_scheduled',
  'quoted',
] as const satisfies readonly LeadStage[];
export type OpenLeadStage = (typeof OPEN_LEAD_STAGES)[number];

export const isOpenLeadStage = (stage: string): stage is OpenLeadStage =>
  (OPEN_LEAD_STAGES as readonly string[]).includes(stage);

/**
 * The owner's own pipeline (PRD 3.3): named steps, each inside one fixed stage that the
 * system's automation uses (a sent quotation still moves the lead to "quoted").
 */
export interface LeadStep {
  readonly key: string;
  readonly name: string;
  readonly stage: OpenLeadStage;
  readonly position: number;
  readonly active: boolean;
}

/** One step per stage on day one; owners rename, add, reorder or switch them off. */
export const DEFAULT_LEAD_STEPS: readonly Omit<LeadStep, 'position' | 'active'>[] = [
  { key: 'new', name: 'New', stage: 'new' },
  { key: 'contacted', name: 'Contacted', stage: 'contacted' },
  { key: 'survey_scheduled', name: 'Survey booked', stage: 'survey_scheduled' },
  { key: 'quoted', name: 'Quotation sent', stage: 'quoted' },
];

/** Steps in pipeline order: by stage, then the owner's order inside the stage. */
export function orderSteps(steps: readonly LeadStep[]): LeadStep[] {
  const rank = (stage: OpenLeadStage) => OPEN_LEAD_STAGES.indexOf(stage);
  return [...steps].sort(
    (a, b) =>
      rank(a.stage) - rank(b.stage) || a.position - b.position || a.name.localeCompare(b.name),
  );
}

/**
 * The step a lead is on: its saved step while that step belongs to the lead's stage;
 * otherwise (automation moved the stage, or the step was switched off) the first active
 * step of the stage. Won and lost leads have no step.
 */
export function effectiveStep(
  steps: readonly LeadStep[],
  stage: LeadStage,
  stepKey: string | null,
): LeadStep | null {
  if (!isOpenLeadStage(stage)) return null;
  const saved = steps.find((step) => step.key === stepKey);
  if (saved && saved.stage === stage && saved.active) return saved;
  return orderSteps(steps).find((step) => step.stage === stage && step.active) ?? null;
}

/**
 * A key for a new step that no step has: from a Latin name ("Loan check" → loan_check),
 * else "step"; a number is added when taken. The key never changes when it is renamed.
 */
export function newStepKey(name: string, taken: readonly string[]): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 44) || 'step';
  let key = base;
  for (let n = 2; taken.includes(key); n += 1) key = `${base}_${n}`;
  return key;
}
