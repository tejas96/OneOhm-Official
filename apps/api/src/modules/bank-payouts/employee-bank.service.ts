import { Inject, Injectable } from '@nestjs/common';
import type { EmployeeBankInput, EmployeeBankView } from '@oneohm/api-contracts';
import { employeeBankDetails, users } from '@oneohm/database';
import { maskAccount } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { type Actor, assertCan } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { bankFieldsOf, recordBankChange } from './bank-hold';

/**
 * An employee's bank account, so money owed to them (an approved travel claim) can go by
 * bank transfer like a vendor's or crew's. Theirs to enter, or finance's. The same rules
 * apply as for vendors: name, IFSC and number typed twice; a change starts the 24-hour hold,
 * is audited masked, and the payment approvers are told. The first entry has no hold.
 */
@Injectable()
export class EmployeeBankService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async save(actor: Actor, userId: string, input: EmployeeBankInput): Promise<EmployeeBankView> {
    if (actor.userId !== userId)
      assertCan(actor, 'finance.record_payments', 'finance.approve_payments');
    const bank = {
      bankAccountName: input.bankAccountName.trim(),
      bankIfsc: input.bankIfsc.trim().toUpperCase(),
      bankAccountNumber: input.bankAccountNumber.replace(/\s+/g, ''),
    };
    return this.db.transaction(async (tx) => {
      const [person] = await tx
        .select({ id: users.id, fullName: users.fullName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!person) throw notFound('That person');
      await tx.insert(employeeBankDetails).values({ id: userId }).onConflictDoNothing();
      const [before] = await tx
        .select()
        .from(employeeBankDetails)
        .where(eq(employeeBankDetails.id, userId))
        .for('update');
      await tx
        .update(employeeBankDetails)
        .set({ ...bank, updatedAt: new Date() })
        .where(eq(employeeBankDetails.id, userId));
      await recordBankChange(tx, {
        kind: 'employee',
        id: userId,
        payeeName: person.fullName,
        actor,
        before: bankFieldsOf(before ?? {}),
        after: bankFieldsOf(bank),
      });
      const [saved] = await tx
        .select()
        .from(employeeBankDetails)
        .where(eq(employeeBankDetails.id, userId));
      return {
        userId,
        bankAccountName: saved?.bankAccountName ?? null,
        bankAccountMasked: saved?.bankAccountNumber ? maskAccount(saved.bankAccountNumber) : null,
        bankIfsc: saved?.bankIfsc ?? null,
        holdUntil: saved?.bankHoldUntil?.toISOString() ?? null,
      };
    });
  }
}
