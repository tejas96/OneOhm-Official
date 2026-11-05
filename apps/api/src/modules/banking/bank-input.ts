import { BANK_PROBLEM_TEXT } from '@oneohm/domain';
import { invalid } from '../../common/http/errors';

/**
 * A new account number needs a name on the account. On an edit the name may already be
 * saved, so the check is on what the row will hold after the save.
 */
export function assertNameWithNumber(
  newNumber: string | null | undefined,
  nameAfterSave: string | null | undefined,
): void {
  if (!newNumber || (nameAfterSave ?? '').trim()) return;
  throw invalid(BANK_PROBLEM_TEXT.name_required, {
    bankAccountName: BANK_PROBLEM_TEXT.name_required,
  });
}
