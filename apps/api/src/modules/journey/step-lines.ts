import { formatInr } from '@oneohm/shared';
import type { StepFacts } from './journey-pending';
import { STEP_WORDS } from './step-words';

/** Home's line for a subsidy, bank or layout question that still waits (after "Not yet", the subsidy waits for the money). */
export function stepLine(step: StepFacts, home: string, waiting: boolean): string {
  const words = STEP_WORDS;
  switch (step.kind) {
    case 'subsidy_register':
      return words.register.line(home);
    case 'subsidy_credit':
      return waiting ? words.credit.notYet : words.credit.ask(formatInr(step.amountPaise), home);
    case 'bank_sign':
      return words.bank.ask(step.bank, step.branch, step.day);
    case 'layout':
      return words.layout.ask(home);
  }
}
