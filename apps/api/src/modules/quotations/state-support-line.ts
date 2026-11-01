import { type DatabaseExecutor, stateSubsidyRules } from '@oneohm/database';
import {
  calculateStateTopUp,
  DEFAULT_TOP_UP_STATE,
  type StateTopUpRule,
  type SubsidyResult,
  stateRuleInForce,
} from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import type { QuoteParts } from './quotation-totals';
import type { SiteFacts } from './site-facts';

/** The site state's top-up rule in force today; null when none is set up (the default). */
export async function stateRuleToday(
  db: DatabaseExecutor,
  site: SiteFacts,
): Promise<StateTopUpRule | null> {
  const rows = await db.select().from(stateSubsidyRules);
  return stateRuleInForce(rows, site.state ?? DEFAULT_TOP_UP_STATE, todayIn());
}

/**
 * The state's low-income top-up as its own line next to the central subsidy (PRD 3.5).
 * Display only, like the central subsidy: the invoice is always the full price.
 */
export function stateSupportFor(
  parts: Pick<QuoteParts, 'input' | 'site' | 'stateRule'>,
  capacityWp: number,
  central: SubsidyResult,
) {
  return calculateStateTopUp(
    {
      category: parts.input.subsidyCategory,
      capacityWp,
      siteState: parts.site.state ?? DEFAULT_TOP_UP_STATE,
      lowIncomeHousehold: parts.site.lowIncomeHousehold ?? false,
      central,
    },
    parts.stateRule ?? null,
  );
}
