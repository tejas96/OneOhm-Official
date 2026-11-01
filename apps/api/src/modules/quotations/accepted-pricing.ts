import { type DatabaseExecutor, quotationLines, quotations } from '@oneohm/database';
import type { RateCard, SavedLinePrice, SubsidyRule } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';

/**
 * What an accepted quotation was priced with: its own rates, subsidy rule and saved line
 * prices. Re-pricing after the survey uses these, so only what was measured changes the
 * price (PRD 3.5, 3.9: rate changes never silently change accepted quotations).
 */
export interface AcceptedPricing {
  readonly quotationId: string;
  readonly rates: RateCard;
  readonly rule: SubsidyRule | null;
  readonly lines: readonly SavedLinePrice[];
}

export async function acceptedPricing(
  db: DatabaseExecutor,
  quotationId: string,
): Promise<AcceptedPricing> {
  const [row] = await db
    .select({ snapshot: quotations.snapshot })
    .from(quotations)
    .where(eq(quotations.id, quotationId))
    .limit(1);
  if (!row) throw notFound('That quotation');
  const snapshot = row.snapshot as { rates: RateCard; rule?: SubsidyRule | null };
  const lines = await db
    .select({
      key: quotationLines.key,
      unitPricePaise: quotationLines.unitPricePaise,
      unitCostPaise: quotationLines.unitCostPaise,
      taxRateBp: quotationLines.taxRateBp,
    })
    .from(quotationLines)
    .where(eq(quotationLines.quotationId, quotationId));
  return { quotationId, rates: snapshot.rates, rule: snapshot.rule ?? null, lines };
}
