import { Inject, Injectable } from '@nestjs/common';
import type {
  StateSubsidyInput,
  StateSubsidyVersion,
  SubsidyRuleState,
} from '@oneohm/api-contracts';
import { stateSubsidyRules } from '@oneohm/database';
import { DEFAULT_TOP_UP_STATE } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, desc, eq, ne } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';

type RuleRow = typeof stateSubsidyRules.$inferSelect;

/** Newest start first: the first one already started is in force today. */
function withStatus(rows: readonly RuleRow[], today: string): StateSubsidyVersion[] {
  const inForce = rows.find((row) => row.validFrom <= today)?.id;
  return rows.map(({ createdAt: _created, ...row }) => {
    const status: SubsidyRuleState =
      row.validFrom > today ? 'scheduled' : row.id === inForce ? 'in_force' : 'earlier';
    return { ...row, status };
  });
}

/**
 * Maharashtra's low-income top-up (PRD 3.5), as rule versions from a start date. Like the
 * central rules, a version in force is history and never changes; quotations keep the
 * version they were priced with. With no version, no quotation shows state support.
 */
@Injectable()
export class StateRulesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<StateSubsidyVersion[]> {
    const rows = await this.db
      .select()
      .from(stateSubsidyRules)
      .where(eq(stateSubsidyRules.state, DEFAULT_TOP_UP_STATE))
      .orderBy(desc(stateSubsidyRules.validFrom));
    return withStatus(rows, todayIn());
  }

  async create(actor: Actor, input: StateSubsidyInput): Promise<StateSubsidyVersion> {
    await this.assertStartFree(input);
    const [row] = await this.db
      .insert(stateSubsidyRules)
      .values({ ...input, state: DEFAULT_TOP_UP_STATE })
      .returning();
    if (!row) throw new Error('State rule insert returned nothing.');
    await recordAudit(this.db, actor.userId, 'state_subsidy_rule.created', 'subsidy_rule', row.id, {
      ...input,
    });
    return this.version(row.id);
  }

  async update(actor: Actor, id: string, input: StateSubsidyInput): Promise<StateSubsidyVersion> {
    const existing = await this.notYetInForce(id);
    await this.assertStartFree(input, id);
    await this.db.update(stateSubsidyRules).set(input).where(eq(stateSubsidyRules.id, id));
    await recordAudit(this.db, actor.userId, 'state_subsidy_rule.updated', 'subsidy_rule', id, {
      before: { ...existing, createdAt: undefined },
      after: input,
    });
    return this.version(id);
  }

  async remove(actor: Actor, id: string): Promise<void> {
    const existing = await this.notYetInForce(id);
    await this.db.delete(stateSubsidyRules).where(eq(stateSubsidyRules.id, id));
    await recordAudit(this.db, actor.userId, 'state_subsidy_rule.withdrawn', 'subsidy_rule', id, {
      validFrom: existing.validFrom,
    });
  }

  private async version(id: string): Promise<StateSubsidyVersion> {
    const found = (await this.list()).find((rule) => rule.id === id);
    if (!found) throw notFound('That state rule');
    return found;
  }

  private async notYetInForce(id: string): Promise<RuleRow> {
    const [row] = await this.db
      .select()
      .from(stateSubsidyRules)
      .where(eq(stateSubsidyRules.id, id))
      .limit(1);
    if (!row) throw notFound('That state rule');
    if (row.validFrom <= todayIn()) {
      throw conflict(
        'This rule is already in force, so it stays as history. Add a new version with a later start date instead.',
        'rule_in_force',
      );
    }
    return row;
  }

  private async assertStartFree(input: StateSubsidyInput, exceptId?: string): Promise<void> {
    if (input.validFrom < todayIn()) {
      throw invalid('A new version cannot start in the past.', {
        validFrom: 'Start today or later; earlier dates are history.',
      });
    }
    const sameDay = and(
      eq(stateSubsidyRules.state, DEFAULT_TOP_UP_STATE),
      eq(stateSubsidyRules.validFrom, input.validFrom),
    );
    const [taken] = await this.db
      .select({ id: stateSubsidyRules.id })
      .from(stateSubsidyRules)
      .where(exceptId ? and(sameDay, ne(stateSubsidyRules.id, exceptId)) : sameDay)
      .limit(1);
    if (taken) {
      throw invalid('Another version starts on the same day.', {
        validFrom: 'Another version starts on this day. Edit that one, or pick another date.',
      });
    }
  }
}
