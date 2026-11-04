import { Inject, Injectable } from '@nestjs/common';
import type { PayoutDetailsInput, PayoutDetailsView } from '@oneohm/api-contracts';
import { holdersOf, notify, resellerPayoutDetails, users } from '@oneohm/database';
import {
  maskPayoutAccount,
  type PayoutDetails,
  payoutDetailsComplete,
  payoutDetailsProblems,
} from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, can } from '../../common/auth/actor';
import { forbidden, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';

const FIELDS = ['bankAccountName', 'bankAccountNumber', 'bankIfsc', 'upiId', 'pan'] as const;
const MASK = '••••';
const NONE: PayoutDetails = {
  bankAccountName: null,
  bankAccountNumber: null,
  bankIfsc: null,
  upiId: null,
  pan: null,
};

/** Trimmed and uppercased; blank becomes null. */
const tidy = (value: string | null): string | null => value?.trim().toUpperCase() || null;

/** A reseller's PAN and UPI or bank details: theirs to edit, finance's to read and fix. */
@Injectable()
export class PayoutDetailsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async get(actor: Actor, resellerId: string): Promise<PayoutDetailsView> {
    this.assertMayUse(actor, resellerId);
    await this.person(resellerId);
    return this.view(actor, await this.stored(resellerId));
  }

  async save(
    actor: Actor,
    resellerId: string,
    input: PayoutDetailsInput,
  ): Promise<PayoutDetailsView> {
    this.assertMayUse(actor, resellerId);
    const person = await this.person(resellerId);
    const before = await this.stored(resellerId);
    const next = this.merged(input, before);
    const problems = payoutDetailsProblems(next);
    if (Object.keys(problems).length > 0) throw invalid('Check the payout details.', problems);
    const changed = FIELDS.filter((field) => next[field] !== before[field]);
    await this.db.transaction(async (tx) => {
      await tx
        .insert(resellerPayoutDetails)
        .values({ userId: resellerId, ...next, updatedByUserId: actor.userId })
        .onConflictDoUpdate({
          target: resellerPayoutDetails.userId,
          set: { ...next, updatedByUserId: actor.userId, updatedAt: new Date() },
        });
      // Field names only: the values never go into the audit log.
      await recordAudit(tx, actor.userId, 'reseller.payout_details_saved', 'reseller', resellerId, {
        fields: changed,
      });
      if (actor.userId === resellerId && changed.length > 0) {
        // Every active holder, Super Admin and people on leave included: this is the guard
        // against payouts being redirected, so nobody who can pay may miss it.
        for (const userId of await holdersOf(tx, 'finance.record_payments')) {
          await notify(
            tx,
            { userId },
            {
              kind: 'payout_details_changed',
              title: `${person.fullName} changed their payout details`,
              body: 'Check the new details before the next payout.',
              dedupeKey: `payout_details_changed:${resellerId}:${Date.now()}:${userId}`,
            },
          );
        }
      }
    });
    return this.view(actor, next);
  }

  private assertMayUse(actor: Actor, resellerId: string): void {
    if (actor.userId !== resellerId && !can(actor, 'finance.record_payments')) throw forbidden();
  }

  private async person(id: string) {
    const [row] = await this.db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!row) throw notFound('That person');
    return row;
  }

  private async stored(userId: string): Promise<PayoutDetails> {
    const [row] = await this.db
      .select()
      .from(resellerPayoutDetails)
      .where(eq(resellerPayoutDetails.userId, userId))
      .limit(1);
    return row ?? NONE;
  }

  /** Tidied input; a masked value sent back unchanged keeps what is stored. */
  private merged(input: PayoutDetailsInput, before: PayoutDetails): PayoutDetails {
    const next = { ...NONE };
    for (const field of FIELDS) {
      const value = tidy(input[field]);
      next[field] = value?.startsWith(MASK) ? before[field] : value;
    }
    return next;
  }

  private view(actor: Actor, details: PayoutDetails): PayoutDetailsView {
    const full = can(actor, 'finance.record_payments');
    return {
      ...details,
      bankAccountNumber: full
        ? details.bankAccountNumber
        : maskPayoutAccount(details.bankAccountNumber),
      pan: full ? details.pan : maskPayoutAccount(details.pan),
      complete: payoutDetailsComplete(details),
    };
  }
}
