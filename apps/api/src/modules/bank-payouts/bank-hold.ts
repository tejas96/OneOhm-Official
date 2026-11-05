import {
  contractors,
  type DatabaseExecutor,
  notifyHolders,
  users,
  vendors,
} from '@oneohm/database';
import {
  type BankFields,
  bankChange,
  holdEndsAt,
  holdText,
  isHeld,
  maskAccount,
} from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import type { Payee } from './payees';

export type PayeeKind = 'vendor' | 'contractor';

interface BankColumns {
  bankAccountName?: string | null | undefined;
  bankAccountNumber?: string | null | undefined;
  bankIfsc?: string | null | undefined;
}

/** A payee row's bank fields, in the domain's shape. */
export const bankFieldsOf = (row: BankColumns): BankFields => ({
  name: row.bankAccountName,
  accountNumber: row.bankAccountNumber,
  ifsc: row.bankIfsc,
});

/** The bank fields after a save: the saved row with whatever the save sets on top. */
export const bankAfterSave = (row: BankColumns, changes: BankColumns): BankFields =>
  bankFieldsOf({
    bankAccountName:
      changes.bankAccountName !== undefined ? changes.bankAccountName : row.bankAccountName,
    bankAccountNumber:
      changes.bankAccountNumber !== undefined ? changes.bankAccountNumber : row.bankAccountNumber,
    bankIfsc: changes.bankIfsc !== undefined ? changes.bankIfsc : row.bankIfsc,
  });

/** Both payee tables carry the same bank and hold columns. */
export const payeeTable = (kind: PayeeKind) =>
  kind === 'vendor' ? vendors : (contractors as unknown as typeof vendors);

/** A moment in plain words, in Indian time, for example "6 Nov, 4:30 pm". */
export function readableMoment(at: Date): string {
  return at.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** True while bank transfers to this payee wait on a hold. */
export const payeeHeld = (payee: Pick<Payee, 'hold'>, now = new Date()): boolean =>
  isHeld(payee.hold, now);

/** The hold in plain words, naming who changed the details. */
export async function holdMessage(db: DatabaseExecutor, payee: Payee): Promise<string> {
  const [who] = payee.hold.changedByUserId
    ? await db
        .select({ name: users.fullName })
        .from(users)
        .where(eq(users.id, payee.hold.changedByUserId))
    : [];
  return holdText(
    payee.name,
    readableMoment(payee.hold.heldUntil ?? new Date()),
    who?.name ?? null,
  );
}

const last4 = (number: string | null | undefined): string | null =>
  number ? maskAccount(number) : null;

/**
 * Called by every path that saves a vendor's or contractor's bank details, in the same
 * transaction, after the save. A real change to complete saved details starts a 24-hour hold,
 * is audited (masked, never the full number) and the approvers are told. The first entry
 * has no hold. Spacing and capitals are not changes.
 */
export async function recordBankChange(
  tx: DatabaseExecutor,
  input: {
    kind: PayeeKind;
    id: string;
    payeeName: string;
    actor: Actor;
    before: BankFields;
    after: BankFields;
  },
): Promise<'none' | 'added' | 'changed'> {
  const change = bankChange(input.before, input.after);
  if (change === 'none') return change;
  const now = new Date();
  const table = payeeTable(input.kind);
  const held = change === 'changed';
  await tx
    .update(table)
    .set({
      bankChangedAt: now,
      bankChangedByUserId: input.actor.userId,
      bankHoldUntil: held ? holdEndsAt(now) : null,
      bankHoldReleasedAt: null,
      bankHoldReleasedByUserId: null,
    })
    .where(eq(table.id, input.id));
  const shown = (bank: BankFields) => ({
    last4: last4(bank.accountNumber),
    ifsc: bank.ifsc?.trim().toUpperCase() || null,
  });
  await recordAudit(
    tx,
    input.actor.userId,
    held ? 'payee.bank_changed' : 'payee.bank_added',
    input.kind,
    input.id,
    {
      payee: input.payeeName,
      ...(held
        ? { old: shown(input.before), new: shown(input.after), holdUntil: holdEndsAt(now) }
        : { new: shown(input.after) }),
    },
  );
  if (held) {
    await notifyHolders(
      tx,
      'finance.approve_payments',
      {
        kind: 'payee_bank_changed',
        title: `Bank details changed: ${input.payeeName}`,
        body: `${input.actor.fullName} changed the bank details of ${input.payeeName}. Bank transfers to them wait until ${readableMoment(holdEndsAt(now))}.`,
        dedupeKey: `payee_bank_changed:${input.kind}:${input.id}:${now.getTime()}`,
        // Opens the vendor or crew page, where the new details and the hold show.
        subject: { type: input.kind, id: input.id },
      },
      input.actor.userId,
    );
  }
  return change;
}
