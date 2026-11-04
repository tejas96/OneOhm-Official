import { invalid } from '../../common/http/errors';

/** What the owner fills in before a project is made, as far as these checks need it. */
interface ProjectInput {
  readonly loan: boolean;
  readonly loanPaise: number;
  readonly managerUserId?: string | null | undefined;
  readonly startDate: string;
  readonly targetFinishDate?: string | null | undefined;
}

/**
 * The project form's own rules: a named project manager (live review B6: nobody becomes
 * the manager by default), a loan amount for a loan project, a finish after the start.
 * Returns the manager.
 */
export function checkProjectInput(input: ProjectInput): string {
  if (!input.managerUserId)
    throw invalid('Pick the project manager.', {
      managerUserId: 'Pick who manages this project.',
    });
  if (input.loan && input.loanPaise <= 0)
    throw invalid('Enter the loan amount.', { loanPaise: 'Required for a loan project.' });
  if (input.targetFinishDate && input.targetFinishDate < input.startDate)
    throw invalid('The target finish comes after the start.', {
      targetFinishDate: 'Pick a date on or after the start date.',
    });
  return input.managerUserId;
}
