/**
 * The hold after a payee's saved bank details change. A changed account number is the
 * classic way to steal a payment, so no bank transfer goes to new details for 24 hours,
 * unless a second approver (not the person who made the change) releases it early.
 */
export const BANK_HOLD_HOURS = 24;

/** The three bank fields, as typed or as saved. */
export interface BankFields {
  readonly name?: string | null | undefined;
  readonly accountNumber?: string | null | undefined;
  readonly ifsc?: string | null | undefined;
}

const clean = {
  name: (value: string | null | undefined) =>
    (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase(),
  accountNumber: (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ''),
  ifsc: (value: string | null | undefined) => (value ?? '').trim().toUpperCase(),
};

const complete = (bank: BankFields): boolean =>
  clean.name(bank.name) !== '' &&
  clean.accountNumber(bank.accountNumber) !== '' &&
  clean.ifsc(bank.ifsc) !== '';

/**
 * What a save did to the bank details:
 * - `changed`: the old details were complete and something real changed (hold);
 * - `added`: the old details were not complete and the new ones are (first entry, no hold);
 * - `none`: nothing real changed. Spacing and capital letters do not count.
 */
export function bankChange(before: BankFields, after: BankFields): 'none' | 'added' | 'changed' {
  const same =
    clean.name(before.name) === clean.name(after.name) &&
    clean.accountNumber(before.accountNumber) === clean.accountNumber(after.accountNumber) &&
    clean.ifsc(before.ifsc) === clean.ifsc(after.ifsc);
  if (same) return 'none';
  if (complete(before)) return 'changed';
  return complete(after) ? 'added' : 'none';
}

/** When a hold that starts now ends. */
export const holdEndsAt = (from: Date): Date =>
  new Date(from.getTime() + BANK_HOLD_HOURS * 3_600_000);

export interface BankHold {
  readonly heldUntil: Date | null;
  readonly releasedAt: Date | null;
}

/** True while a hold is running: set, not yet over and not released early. */
export function isHeld(hold: BankHold, now: Date): boolean {
  return (
    hold.heldUntil !== null && hold.releasedAt === null && now.getTime() < hold.heldUntil.getTime()
  );
}

/** Why this person may not release the hold, or null when they may. */
export function releaseProblem(input: {
  held: boolean;
  canApprovePayments: boolean;
  userId: string;
  changedByUserId: string | null;
}): string | null {
  if (!input.held) return 'There is no hold to release.';
  if (!input.canApprovePayments) return 'Only someone who approves payments can release this hold.';
  if (input.changedByUserId === input.userId) {
    return 'You made this change, so another approver must release the hold.';
  }
  return null;
}

/** The hold in plain words for the screen and for errors, for example "until 6 Nov, 4:30 pm". */
export function holdText(payee: string, until: string, changedBy: string | null): string {
  const who = changedBy ? ` ${changedBy} changed them.` : '';
  return `The bank details of ${payee} changed recently, so bank transfers wait until ${until}.${who} Another approver can release the hold early.`;
}
