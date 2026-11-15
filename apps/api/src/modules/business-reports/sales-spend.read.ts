import { type DatabaseExecutor, marketingCampaigns, marketingSpendDays } from '@oneohm/database';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { indiaDate, type ReportScope } from './report-scope';

/** Ad spend in the report's days, by campaign code (Meta and Google together), in paise. */
export async function readSpendByCode(
  db: DatabaseExecutor,
  scope: Pick<ReportScope, 'from' | 'until'>,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      code: marketingCampaigns.code,
      spend: sql<number>`coalesce(sum(${marketingSpendDays.spendPaise}), 0)::bigint`,
    })
    .from(marketingSpendDays)
    .innerJoin(marketingCampaigns, eq(marketingCampaigns.id, marketingSpendDays.campaignId))
    .where(
      and(
        gte(marketingSpendDays.day, indiaDate(scope.from)),
        lt(marketingSpendDays.day, indiaDate(scope.until)),
      ),
    )
    .groupBy(marketingCampaigns.code);
  return new Map(rows.map((row) => [row.code, Number(row.spend)]));
}
