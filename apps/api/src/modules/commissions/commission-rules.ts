import type { CommissionRule } from '@oneohm/api-contracts';
import { commissionRules, type DatabaseExecutor } from '@oneohm/database';

export type RuleRow = typeof commissionRules.$inferSelect;

/** Until the owner sets one, commission is off: nothing is earned by accident. */
const NO_RULE = {
  basis: 'percent',
  rateBp: 0,
  perKwPaise: 0,
  qualifyingEvent: 'advance_paid',
  active: false,
} as const;

export async function loadRules(db: DatabaseExecutor): Promise<RuleRow[]> {
  return db.select().from(commissionRules);
}

/** The reseller's own rule, else the default, else commission off. */
export function effectiveRule(rules: readonly RuleRow[], resellerId: string | null) {
  const own = resellerId ? rules.find((rule) => rule.resellerUserId === resellerId) : undefined;
  const fallback = rules.find((rule) => rule.resellerUserId === null);
  return { rule: own ?? fallback ?? null, custom: Boolean(own) };
}

export function presentRule(
  row: RuleRow | null,
  reseller: { id: string; fullName: string } | null,
): CommissionRule {
  const source = row ?? NO_RULE;
  return {
    id: row?.id ?? null,
    reseller,
    basis: source.basis,
    rateBp: source.rateBp,
    perKwPaise: source.perKwPaise,
    qualifyingEvent: source.qualifyingEvent,
    active: source.active,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}
