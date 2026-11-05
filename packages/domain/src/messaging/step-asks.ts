/**
 * The subsidy, bank and layout questions we ask a customer (redesign §4, §18 11, 15): each is a
 * `confirm` customer action whose payload names its kind, and belongs to one task template of the project.
 */
export const STEP_KINDS = ['subsidy_register', 'subsidy_credit', 'bank_sign', 'layout'] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export const isStepKind = (value: unknown): value is StepKind =>
  (STEP_KINDS as readonly unknown[]).includes(value);

/** The task template each question hangs on (its customer messages must be on, PRD 6.2). */
export const STEP_TASK_KEYS: Readonly<Record<StepKind, string>> = {
  subsidy_register: 'subsidy_application',
  subsidy_credit: 'subsidy_release',
  bank_sign: 'loan_approval',
  layout: 'system_design',
};

const DAY = 24 * 3_600_000;

/**
 * Whether a customer who said the subsidy has not reached them has waited long enough for the team
 * to look into it (Settings → Reminders, default 15 days). Counted from the answer.
 */
export function subsidyChaseDue(answeredAt: Date, now: Date, days: number): boolean {
  return now.getTime() - answeredAt.getTime() >= days * DAY;
}

/** Which loan status changes the customer hears about; nothing for the others or a repeated save. */
export function loanStatusNews(from: string | null, to: string): 'sanctioned' | 'rejected' | null {
  if (from === to) return null;
  return to === 'sanctioned' || to === 'rejected' ? to : null;
}

/** A day for signing at the bank must be a real date, today or later (business-day "YYYY-MM-DD"). */
export function bankDayOk(day: string, today: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day)) && day >= today;
}
