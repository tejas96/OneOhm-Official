import { BANK_PROBLEM_TEXT, type BankField, bankProblems } from '@oneohm/domain';
import type { z } from 'zod';

interface BankBody {
  readonly bankAccountName?: string | null | undefined;
  readonly bankIfsc?: string | null | undefined;
  readonly bankAccountNumber?: string | null | undefined;
  readonly bankAccountNumberConfirm?: string | null | undefined;
}

const PATH: Record<BankField, string> = {
  name: 'bankAccountName',
  ifsc: 'bankIfsc',
  number: 'bankAccountNumber',
  confirm: 'bankAccountNumberConfirm',
};

/**
 * The bank-details rules for a vendor or contractor body, from the one rule set in the
 * domain package. A new account number needs the second typing and (on create) the
 * account name; on an edit the service checks the saved name instead (`nameRequired` off).
 */
export function refineBank(body: BankBody, ctx: z.RefinementCtx, nameRequired: boolean): void {
  const problems = bankProblems(
    {
      name: body.bankAccountName,
      ifsc: body.bankIfsc,
      number: body.bankAccountNumber,
      confirm: body.bankAccountNumberConfirm,
    },
    { nameRequired },
  );
  for (const [field, problem] of Object.entries(problems) as [
    BankField,
    keyof typeof BANK_PROBLEM_TEXT,
  ][]) {
    ctx.addIssue({ code: 'custom', path: [PATH[field]], message: BANK_PROBLEM_TEXT[problem] });
  }
}
