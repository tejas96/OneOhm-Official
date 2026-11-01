import { Inject, Injectable } from '@nestjs/common';
import type {
  SubsidyRuleInput,
  SubsidyRuleState,
  SubsidyRuleVersion,
  SubsidyRuleView,
} from '@oneohm/api-contracts';
import { subsidyRules } from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';

type RuleRow = typeof subsidyRules.$inferSelect;

/** Rows by category, newest start first: the first started one is in force today. */
function withStates(rows: readonly RuleRow[], today: string): SubsidyRuleVersion[] {
  const covered = new Set<string>();
  const inForce = new Set<string>();
  for (const row of rows) {
    if (row.validFrom > today || covered.has(row.category)) continue;
    covered.add(row.category);
    inForce.add(row.id);
  }
  return rows.map(({ createdAt: _created, ...row }) => {
    const state: SubsidyRuleState =
      row.validFrom > today ? 'scheduled' : inForce.has(row.id) ? 'in_force' : 'earlier';
    return { ...row, slabs: row.slabs as SubsidyRuleView['slabs'], state };
  });
}

/** Society limits mean nothing for other categories; they are not kept for them. */
function valuesOf(input: SubsidyRuleInput) {
  const society = input.category === 'society';
  return {
    category: input.category,
    validFrom: input.validFrom,
    slabs: input.slabs,
    capPaise: input.capPaise,
    perHouseholdWp: society ? input.perHouseholdWp : null,
    maxEligibleWp: society ? input.maxEligibleWp : null,
  };
}

/**
 * Subsidy rule versions (PRD 3.5). A change is a new version from a start date; versions
 * already in force are history and never change. Quotations keep their own snapshot.
 */
@Injectable()
export class SubsidyRulesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<SubsidyRuleVersion[]> {
    const rows = await this.db
      .select()
      .from(subsidyRules)
      .orderBy(asc(subsidyRules.category), desc(subsidyRules.validFrom));
    return withStates(rows, todayIn());
  }

  async create(actor: Actor, input: SubsidyRuleInput): Promise<SubsidyRuleVersion> {
    await this.assertStartFree(input);
    const [row] = await this.db.insert(subsidyRules).values(valuesOf(input)).returning();
    if (!row) throw new Error('Subsidy rule insert returned nothing.');
    await recordAudit(this.db, actor.userId, 'subsidy_rule.created', 'subsidy_rule', row.id, {
      ...valuesOf(input),
    });
    return this.version(row.id);
  }

  async update(actor: Actor, id: string, input: SubsidyRuleInput): Promise<SubsidyRuleVersion> {
    const existing = await this.notYetInForce(id);
    await this.assertStartFree(input, id);
    await this.db.update(subsidyRules).set(valuesOf(input)).where(eq(subsidyRules.id, id));
    await recordAudit(this.db, actor.userId, 'subsidy_rule.updated', 'subsidy_rule', id, {
      before: { ...existing, createdAt: undefined },
      after: valuesOf(input),
    });
    return this.version(id);
  }

  async remove(actor: Actor, id: string): Promise<void> {
    const existing = await this.notYetInForce(id);
    await this.db.delete(subsidyRules).where(eq(subsidyRules.id, id));
    await recordAudit(this.db, actor.userId, 'subsidy_rule.withdrawn', 'subsidy_rule', id, {
      category: existing.category,
      validFrom: existing.validFrom,
    });
  }

  private async version(id: string): Promise<SubsidyRuleVersion> {
    const found = (await this.list()).find((rule) => rule.id === id);
    if (!found) throw notFound('That subsidy rule');
    return found;
  }

  /** Only a version that starts after today can change or be withdrawn. */
  private async notYetInForce(id: string): Promise<RuleRow> {
    const [row] = await this.db.select().from(subsidyRules).where(eq(subsidyRules.id, id)).limit(1);
    if (!row) throw notFound('That subsidy rule');
    if (row.validFrom <= todayIn()) {
      throw conflict(
        'This rule is already in force, so it stays as history. Add a new version with a later start date instead.',
        'rule_in_force',
      );
    }
    return row;
  }

  /** A version starts today or later, and never on the same day as another of its category. */
  private async assertStartFree(input: SubsidyRuleInput, exceptId?: string): Promise<void> {
    if (input.validFrom < todayIn()) {
      throw invalid('A new version cannot start in the past.', {
        validFrom: 'Start today or later; earlier dates are history.',
      });
    }
    const sameDay = and(
      eq(subsidyRules.category, input.category),
      eq(subsidyRules.validFrom, input.validFrom),
    );
    const [taken] = await this.db
      .select({ id: subsidyRules.id })
      .from(subsidyRules)
      .where(exceptId ? and(sameDay, ne(subsidyRules.id, exceptId)) : sameDay)
      .limit(1);
    if (taken) {
      throw invalid('Another version of this rule starts on the same day.', {
        validFrom: 'Another version starts on this day. Edit that one, or pick another date.',
      });
    }
  }
}
