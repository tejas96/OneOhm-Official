import type { CampaignDetail } from '@oneohm/api-contracts';
import { type DatabaseExecutor, leads, marketingSpendDays } from '@oneohm/database';
import { landingPageUrl } from '@oneohm/marketing';
import { addDays, todayIn } from '@oneohm/shared';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { readCard } from './campaign-cards.read';

const DAYS = 30;

/** The last `DAYS` days, oldest first, each with its spend and leads (zero when none). */
export function fillDays(
  today: string,
  spend: ReadonlyMap<string, number>,
  leadCounts: ReadonlyMap<string, number>,
): CampaignDetail['days'] {
  return Array.from({ length: DAYS }, (_, index) => {
    const day = addDays(today, index - (DAYS - 1));
    return { day, spentPaise: spend.get(day) ?? 0, leads: leadCounts.get(day) ?? 0 };
  });
}

/** What the campaign page shows: the card, its link, 30 days of spend and leads, latest leads. */
export async function readDetail(
  db: DatabaseExecutor,
  apiPublicUrl: string,
  id: string,
): Promise<CampaignDetail> {
  const { card, row } = await readCard(db, id);
  const today = todayIn();
  const since = addDays(today, -(DAYS - 1));
  const spendRows = await db
    .select({
      day: marketingSpendDays.day,
      paise: sql<string>`sum(${marketingSpendDays.spendPaise})`,
    })
    .from(marketingSpendDays)
    .where(and(eq(marketingSpendDays.campaignId, id), gte(marketingSpendDays.day, since)))
    .groupBy(marketingSpendDays.day);
  const dayOfLead = sql<string>`to_char(${leads.createdAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`;
  const leadRows = await db
    .select({ day: dayOfLead, total: sql<number>`count(*)::int` })
    .from(leads)
    .where(
      and(
        eq(leads.campaignCode, row.code),
        gte(leads.createdAt, new Date(`${since}T00:00:00+05:30`)),
      ),
    )
    .groupBy(dayOfLead);
  const latest = await db
    .select({
      id: leads.id,
      name: leads.name,
      city: leads.city,
      stage: leads.stage,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(eq(leads.campaignCode, row.code))
    .orderBy(desc(leads.createdAt))
    .limit(20);
  return {
    ...card,
    landingUrl: row.goal === 'post' ? null : landingPageUrl(apiPublicUrl, row.code),
    opener: `Hi OneOhm ${row.code}`,
    segments: row.segments as CampaignDetail['segments'],
    days: fillDays(
      today,
      new Map(spendRows.map((item) => [item.day, Number(item.paise)])),
      new Map(leadRows.map((item) => [item.day, item.total])),
    ),
    leads: latest.map((lead) => ({ ...lead, createdAt: lead.createdAt.toISOString() })),
  };
}
