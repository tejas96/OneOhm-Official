import type { ReferralProgramInput } from '@oneohm/api-contracts';
import type { CheckKey } from '@/lib/forms/checks';

type Basis = ReferralProgramInput['basis'];

/**
 * A fixed amount and a rate per kW are different numbers: ₹500 fixed is not ₹500 per kW.
 * Switching the basis clears the amount so it is typed again.
 */
export function switchBasis(
  draft: Pick<ReferralProgramInput, 'basis'>,
  basis: Basis,
): Partial<ReferralProgramInput> {
  return basis === draft.basis ? {} : { basis, amountPaise: 0 };
}

/** Field checks before saving, as message keys under `checks`. Empty when it can be saved. */
export function programChecks(
  draft: Pick<ReferralProgramInput, 'active' | 'amountPaise' | 'perCustomerCount'>,
): Record<string, CheckKey> {
  const problems: Record<string, CheckKey> = {};
  if (draft.active && draft.amountPaise <= 0) problems.amountPaise = 'positiveAmount';
  // Empty means no limit; 0 would mean nobody can earn, so it is never taken as "no limit".
  if (draft.perCustomerCount !== null && draft.perCustomerCount < 1) {
    problems.perCustomerCount = 'positiveNumber';
  }
  return problems;
}
