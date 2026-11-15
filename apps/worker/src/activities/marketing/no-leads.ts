import {
  leads,
  marketingCampaigns,
  marketingSpendDays,
  readBusinessSetting,
} from '@oneohm/database';
import { addDays, todayIn } from '@oneohm/shared';
import { and, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import { businessClock } from '../timed-reminders';
import { alertMarketing, rupees } from './alerts';
import type { MarketingDeps } from './deps';

export interface SpendLine {
  readonly externalId: string;
  readonly campaignId: string;
  readonly day: string;
  readonly spendPaise: number;
}

/** The last `count` full days before today, oldest first. */
export const lastFullDays = (today: string, count: number): string[] =>
  Array.from({ length: count }, (_, at) => addDays(today, at - count));

/**
 * Ads that spent money on every one of the days and whose campaign got no lead in that time.
 * Returns each such ad with what it spent in all.
 */
export function adsWithoutLeads(
  lines: readonly SpendLine[],
  days: readonly string[],
  campaignsWithLeads: ReadonlySet<string>,
): { readonly externalId: string; readonly campaignId: string; readonly spendPaise: number }[] {
  const byAd = new Map<string, { campaignId: string; days: Set<string>; spend: number }>();
  for (const line of lines) {
    if (line.spendPaise <= 0 || !days.includes(line.day)) continue;
    const entry = byAd.get(line.externalId) ?? {
      campaignId: line.campaignId,
      days: new Set(),
      spend: 0,
    };
    entry.days.add(line.day);
    entry.spend += line.spendPaise;
    byAd.set(line.externalId, entry);
  }
  return [...byAd.entries()].flatMap(([externalId, entry]) =>
    entry.days.size === days.length && !campaignsWithLeads.has(entry.campaignId)
      ? [{ externalId, campaignId: entry.campaignId, spendPaise: entry.spend }]
      : [],
  );
}

/** Tells the campaign's maker and the owners about ads that spend with nothing to show for it. */
export async function alertNoLeads(deps: MarketingDeps, now: Date): Promise<number> {
  const { db, timeZone } = deps;
  const { noLeadAlertDays } = await readBusinessSetting(db, 'marketing');
  const today = todayIn(timeZone, now);
  const days = lastFullDays(today, noLeadAlertDays);
  const lines = (
    await db
      .select()
      .from(marketingSpendDays)
      .where(
        and(
          isNotNull(marketingSpendDays.campaignId),
          gte(marketingSpendDays.day, days[0] as string),
          lte(marketingSpendDays.day, days.at(-1) as string),
        ),
      )
  ).flatMap((row) => (row.campaignId ? [{ ...row, campaignId: row.campaignId }] : []));
  if (lines.length === 0) return 0;
  const campaignIds = [...new Set(lines.map((line) => line.campaignId))];
  const campaigns = await db
    .select()
    .from(marketingCampaigns)
    .where(inArray(marketingCampaigns.id, campaignIds));
  const since = new Date(
    businessClock(timeZone, now).midnight.getTime() - noLeadAlertDays * 86_400_000,
  );
  const withLeads = await db
    .selectDistinct({ code: leads.campaignCode })
    .from(leads)
    .where(
      and(
        gte(leads.createdAt, since),
        inArray(
          leads.campaignCode,
          campaigns.map((c) => c.code),
        ),
      ),
    );
  const codes = new Set(withLeads.map((row) => row.code));
  const quiet = new Set(campaigns.filter((c) => codes.has(c.code)).map((c) => c.id));
  let told = 0;
  for (const ad of adsWithoutLeads(lines, days, quiet)) {
    const campaign = campaigns.find((c) => c.id === ad.campaignId);
    if (!campaign) continue;
    await alertMarketing(
      db,
      {
        kind: 'marketing_no_leads',
        title: 'An ad is spending with no leads',
        body: `${campaign.name} spent ${rupees(ad.spendPaise)} in ${days.length} days with no leads. Try a new photo or pause it.`,
        dedupeKey: `mkt_no_leads:${ad.externalId}:${today}`,
        subject: { type: 'marketing', id: campaign.id },
      },
      campaign.createdByUserId,
    );
    told += 1;
  }
  return told;
}
