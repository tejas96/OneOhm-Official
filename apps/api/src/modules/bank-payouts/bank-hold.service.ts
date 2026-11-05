import { Inject, Injectable } from '@nestjs/common';
import { notifyHolders, users } from '@oneohm/database';
import { isHeld, releaseProblem } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan, can } from '../../common/auth/actor';
import { forbidden, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { type PayeeKind, payeeTable } from './bank-hold';

/** Lets bank transfers go before the 24-hour hold ends (a second approver only). */
@Injectable()
export class BankHoldService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async release(actor: Actor, kind: PayeeKind, id: string): Promise<void> {
    assertCan(actor, 'finance.approve_payments');
    const table = payeeTable(kind);
    await this.db.transaction(async (tx) => {
      const [payee] = await tx.select().from(table).where(eq(table.id, id)).for('update');
      if (!payee) throw notFound('That payee');
      const problem = releaseProblem({
        held: isHeld(
          { heldUntil: payee.bankHoldUntil, releasedAt: payee.bankHoldReleasedAt },
          new Date(),
        ),
        canApprovePayments: can(actor, 'finance.approve_payments'),
        userId: actor.userId,
        changedByUserId: payee.bankChangedByUserId,
      });
      if (problem) throw forbidden(problem);
      await tx
        .update(table)
        .set({ bankHoldReleasedAt: new Date(), bankHoldReleasedByUserId: actor.userId })
        .where(eq(table.id, id));
      await recordAudit(tx, actor.userId, 'payee.bank_hold_released', kind, id, {
        payee: payee.name,
        changedByUserId: payee.bankChangedByUserId,
      });
      const [changer] = payee.bankChangedByUserId
        ? await tx
            .select({ name: users.fullName })
            .from(users)
            .where(eq(users.id, payee.bankChangedByUserId))
        : [];
      await notifyHolders(
        tx,
        'finance.approve_payments',
        {
          kind: 'payee_bank_hold_released',
          title: `Bank hold released: ${payee.name}`,
          body: `${actor.fullName} released the hold on the new bank details of ${payee.name}${changer ? ` (changed by ${changer.name})` : ''}. Bank transfers to them can go now.`,
          dedupeKey: `payee_bank_hold_released:${kind}:${id}:${Date.now()}`,
          subject: { type: kind, id },
        },
        actor.userId,
      );
    });
  }
}
