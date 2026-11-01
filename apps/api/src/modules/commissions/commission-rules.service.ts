import { Inject, Injectable } from '@nestjs/common';
import type { CommissionRule, CommissionRuleInput } from '@oneohm/api-contracts';
import { commissionRules } from '@oneohm/database';
import { eq, isNull } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { evaluateCommissions } from './commission-evaluation';
import { effectiveRule, loadRules, presentRule } from './commission-rules';
import { resellers } from './reseller-attribution';

/** The default commission rule and each reseller's own, set by the owner (PRD 4.8). */
@Injectable()
export class CommissionRulesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async defaultRule(): Promise<CommissionRule> {
    const { rule } = effectiveRule(await loadRules(this.db), null);
    return presentRule(rule, null);
  }

  async saveDefault(actor: Actor, input: CommissionRuleInput): Promise<CommissionRule> {
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: commissionRules.id, version: commissionRules.version })
        .from(commissionRules)
        .where(isNull(commissionRules.resellerUserId));
      const values = { ...input, updatedByUserId: actor.userId, updatedAt: new Date() };
      if (current) {
        await tx
          .update(commissionRules)
          .set({ ...values, version: current.version + 1 })
          .where(eq(commissionRules.id, current.id));
      } else {
        await tx.insert(commissionRules).values({ ...values, resellerUserId: null });
      }
      await recordAudit(tx, actor.userId, 'commission_rule.saved', 'commission_rule', 'default', {
        ...input,
      });
    });
    await evaluateCommissions(this.db);
    return this.defaultRule();
  }

  async saveForReseller(
    actor: Actor,
    resellerId: string,
    input: CommissionRuleInput,
  ): Promise<CommissionRule> {
    const reseller = await this.reseller(resellerId);
    await this.db.transaction(async (tx) => {
      await tx
        .insert(commissionRules)
        .values({ ...input, resellerUserId: resellerId, updatedByUserId: actor.userId })
        .onConflictDoUpdate({
          target: commissionRules.resellerUserId,
          set: { ...input, updatedByUserId: actor.userId, updatedAt: new Date() },
        });
      await recordAudit(tx, actor.userId, 'commission_rule.saved', 'commission_rule', resellerId, {
        ...input,
      });
    });
    await evaluateCommissions(this.db);
    const { rule } = effectiveRule(await loadRules(this.db), resellerId);
    return presentRule(rule, reseller);
  }

  /** The reseller follows the default rule again. */
  async clearForReseller(actor: Actor, resellerId: string): Promise<CommissionRule> {
    const reseller = await this.reseller(resellerId);
    await this.db.transaction(async (tx) => {
      await tx.delete(commissionRules).where(eq(commissionRules.resellerUserId, resellerId));
      await recordAudit(tx, actor.userId, 'commission_rule.cleared', 'commission_rule', resellerId);
    });
    const { rule } = effectiveRule(await loadRules(this.db), resellerId);
    return presentRule(rule, rule?.resellerUserId ? reseller : null);
  }

  private async reseller(id: string) {
    const person = (await resellers(this.db)).find((entry) => entry.id === id);
    if (!person) throw notFound('That reseller');
    return { id: person.id, fullName: person.fullName };
  }
}
