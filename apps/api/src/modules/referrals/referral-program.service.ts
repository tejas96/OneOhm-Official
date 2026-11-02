import { Inject, Injectable } from '@nestjs/common';
import type {
  CustomerReferralProgram,
  ReferralProgram,
  ReferralProgramInput,
} from '@oneohm/api-contracts';
import { companyProfile, referralPrograms, referralRewards } from '@oneohm/database';
import { incentiveTotals } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { businessWhatsAppNumber } from '../whatsapp/business-number';
import { ensureReferralCode, resolveReferralCode } from './referral-codes';
import { evaluateReferralRewards } from './referral-evaluation';
import { loadProgram, toE164, whatsappDigits } from './referral-program';

/** The refer-and-earn programme the owner sets, and each customer's view of it. */
@Injectable()
export class ReferralProgramService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  async get(): Promise<ReferralProgram> {
    const program = await loadProgram(this.db);
    const rewards = await this.db
      .select({ status: referralRewards.status, amountPaise: referralRewards.amountPaise })
      .from(referralRewards);
    const totals = incentiveTotals(rewards);
    return {
      active: program.active,
      basis: program.basis,
      amountPaise: program.amountPaise,
      qualifyingEvent: program.qualifyingEvent,
      startsOn: program.startsOn,
      budgetPaise: program.budgetPaise,
      perCustomerCount: program.perCustomerCount,
      perCustomerPaise: program.perCustomerPaise,
      eligibleTypes: program.eligibleTypes,
      shareNumber: program.shareNumberE164,
      defaultShareNumber: await this.companyNumber(),
      committedPaise: totals.earnedPaise,
      paidPaise: totals.paidPaise,
      updatedAt: program.saved ? program.updatedAt.toISOString() : null,
    };
  }

  async save(actor: Actor, input: ReferralProgramInput): Promise<ReferralProgram> {
    const current = await loadProgram(this.db);
    const values = {
      active: input.active,
      basis: input.basis,
      amountPaise: input.amountPaise,
      qualifyingEvent: input.qualifyingEvent,
      startsOn: input.startsOn,
      budgetPaise: input.budgetPaise,
      perCustomerCount: input.perCustomerCount,
      perCustomerPaise: input.perCustomerPaise,
      eligibleTypes: [...new Set(input.eligibleTypes)],
      shareNumberE164: toE164(input.shareNumber),
      updatedByUserId: actor.userId,
      updatedAt: new Date(),
    };
    await this.db.transaction(async (tx) => {
      if (current.saved) {
        await tx
          .update(referralPrograms)
          .set({ ...values, version: current.version + 1 })
          .where(eq(referralPrograms.id, current.id));
      } else {
        await tx.insert(referralPrograms).values(values);
      }
      await recordAudit(tx, actor.userId, 'referral_program.saved', 'referral_program', 'default', {
        active: values.active,
        basis: values.basis,
        amountPaise: values.amountPaise,
        qualifyingEvent: values.qualifyingEvent,
        budgetPaise: values.budgetPaise,
      });
    });
    // Referrals that already qualify under the new terms earn their reward now.
    await evaluateReferralRewards(this.db);
    return this.get();
  }

  async lookup(code: string) {
    const owner = await resolveReferralCode(this.db, code);
    if (!owner) throw notFound('That referral code');
    return { customerId: owner.customerId, name: owner.name, code: owner.code };
  }

  async forCustomer(customerId: string): Promise<CustomerReferralProgram> {
    await evaluateReferralRewards(this.db);
    const code = await ensureReferralCode(this.db, customerId);
    const program = await loadProgram(this.db);
    const rewards = await this.db
      .select({ status: referralRewards.status, amountPaise: referralRewards.amountPaise })
      .from(referralRewards)
      .where(eq(referralRewards.referrerCustomerId, customerId));
    return {
      code,
      active: program.active && program.amountPaise > 0,
      basis: program.basis,
      amountPaise: program.amountPaise,
      qualifyingEvent: program.qualifyingEvent,
      whatsappNumber: whatsappDigits(program.shareNumberE164 ?? (await this.companyNumber())),
      totals: incentiveTotals(rewards),
    };
  }

  /** Friends write to the business number, where the assistant picks up the code. */
  private async companyNumber(): Promise<string | null> {
    const business = await businessWhatsAppNumber(this.env);
    if (business) return business;
    const [company] = await this.db.select({ phones: companyProfile.phones }).from(companyProfile);
    return toE164(company?.phones[0] ?? null);
  }
}
