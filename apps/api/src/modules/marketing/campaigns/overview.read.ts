import type { MarketingOverview } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  leads,
  marketingCampaigns,
  marketingSpendDays,
  readBusinessSetting,
} from '@oneohm/database';
import { costPer } from '@oneohm/domain';
import { connectionsFor } from '@oneohm/marketing';
import { addDays, todayIn } from '@oneohm/shared';
import { and, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { readCards } from './campaign-cards.read';
import type { CampaignContext } from './campaign-context';
import { type AlertCampaign, buildAlerts } from './overview-alerts';
import { readCodeCards, readReferralCard, readReviews } from './overview-extra.read';

type ConnectionWord = MarketingOverview['connections']['meta'];

/** Meta or Google in one word for the header chip. */
export function connectionWord(status: string | undefined): ConnectionWord {
  if (status === 'connected' || status === 'in_review' || status === 'needs_attention')
    return status;
  return 'not_connected';
}

/** The last 30 days across every marketing campaign. */
async function readTotals(
  db: DatabaseExecutor,
  today: string,
): Promise<MarketingOverview['totals']> {
  const since = addDays(today, -29);
  const [spend] = await db
    .select({ paise: sql<string>`coalesce(sum(${marketingSpendDays.spendPaise}), 0)` })
    .from(marketingSpendDays)
    .where(and(isNotNull(marketingSpendDays.campaignId), gte(marketingSpendDays.day, since)));
  const [counted] = await db
    .select({ total: sql<number>`count(*)::int`, won: sql<number>`count(${leads.wonAt})::int` })
    .from(leads)
    .where(
      and(
        gte(leads.createdAt, new Date(`${since}T00:00:00+05:30`)),
        inArray(
          leads.campaignCode,
          db.select({ code: marketingCampaigns.code }).from(marketingCampaigns),
        ),
      ),
    );
  const spentPaise = Number(spend?.paise ?? 0);
  const sales = counted?.won ?? 0;
  return {
    spentPaise,
    leads: counted?.total ?? 0,
    sales,
    costPerSalePaise: costPer(spentPaise, sales),
  };
}

/** Spend and leads over the last full days, for the "spent but no leads" alert. */
async function readAlertCampaigns(
  db: DatabaseExecutor,
  cards: readonly Awaited<ReturnType<typeof readCards>>['cards'][number][],
  days: readonly string[],
): Promise<AlertCampaign[]> {
  const live = cards.filter((card) => card.state === 'live');
  if (live.length === 0 || days.length === 0) return [];
  const first = days[0] as string;
  const last = days.at(-1) as string;
  const spend = await db
    .select({
      id: marketingSpendDays.campaignId,
      day: marketingSpendDays.day,
      paise: sql<string>`sum(${marketingSpendDays.spendPaise})`,
    })
    .from(marketingSpendDays)
    .where(
      and(
        inArray(
          marketingSpendDays.campaignId,
          live.map((card) => card.id),
        ),
        gte(marketingSpendDays.day, first),
        sql`${marketingSpendDays.day} <= ${last}`,
      ),
    )
    .groupBy(marketingSpendDays.campaignId, marketingSpendDays.day);
  const found = await db
    .select({ code: leads.campaignCode, total: sql<number>`count(*)::int` })
    .from(leads)
    .where(
      and(
        inArray(
          leads.campaignCode,
          live.map((card) => card.code),
        ),
        gte(leads.createdAt, new Date(`${first}T00:00:00+05:30`)),
        lt(leads.createdAt, new Date(`${addDays(last, 1)}T00:00:00+05:30`)),
      ),
    )
    .groupBy(leads.campaignCode);
  return live.map((card) => ({
    id: card.id,
    name: card.name,
    state: card.state,
    placements: card.placements.map((place) => ({ state: place.state, error: place.error })),
    spendByDay: new Map(
      spend.filter((row) => row.id === card.id).map((row) => [row.day, Number(row.paise)]),
    ),
    leadsInWindow: found.find((row) => row.code === card.code)?.total ?? 0,
  }));
}

/** Everything the Marketing home shows. */
export async function readOverview(ctx: CampaignContext): Promise<MarketingOverview> {
  const { db, config } = ctx;
  const now = new Date();
  const today = todayIn('Asia/Kolkata', now);
  const settings = await readBusinessSetting(db, 'marketing');
  const connections = await connectionsFor(db, config.mode);
  const status = (provider: 'meta' | 'google') =>
    connections.find((row) => row.provider === provider)?.status;
  const { cards } = await readCards(db);
  const days = Array.from({ length: settings.noLeadAlertDays }, (_, index) =>
    addDays(today, index - settings.noLeadAlertDays),
  );
  return {
    mode: config.mode,
    connections: { meta: connectionWord(status('meta')), google: connectionWord(status('google')) },
    campaigns: cards,
    codes: await readCodeCards(db),
    referral: await readReferralCard(db),
    alerts: buildAlerts({
      now,
      lowBalancePaise: settings.lowBalancePaise,
      connections: connections.map((row) => ({
        provider: row.provider,
        status: row.status,
        accountId: row.accountId,
        tokenExpiresAt: row.tokenExpiresAt,
        balancePaise: row.balancePaise,
      })),
      campaigns: await readAlertCampaigns(db, cards, days),
      days,
    }),
    reviews: await readReviews(db),
    totals: await readTotals(db, today),
  };
}
