import type { WaitingAdLeads } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  leadActivities,
  leadCampaigns,
  leads,
  marketingCampaigns,
} from '@oneohm/database';
import { campaignLabel } from '@oneohm/domain';
import { and, desc, eq, gte, inArray, isNotNull, notExists, or, sql } from 'drizzle-orm';

const DAYS = 14;

/**
 * New leads from the last 14 days that an ad brought (a campaign of ours, an ad or click id, a
 * lead form entry, or Google as the source) and nobody has called yet. Without `all`, only
 * the person's own.
 */
export async function readWaitingLeads(
  db: DatabaseExecutor,
  userId: string,
  all: boolean,
  now: Date = new Date(),
): Promise<WaitingAdLeads> {
  const fromAd = or(
    inArray(
      leads.campaignCode,
      db.select({ code: marketingCampaigns.code }).from(marketingCampaigns),
    ),
    isNotNull(leads.adId),
    isNotNull(leads.ctwaClid),
    isNotNull(leads.gclid),
    isNotNull(leads.fbclid),
    isNotNull(leads.platformLeadId),
    // Google always comes from an ad; a plain Instagram or Facebook message is not one (it has
    // no ad id), the same rule as the "New ad lead" alert.
    eq(leads.source, 'google'),
  );
  const where = and(
    eq(leads.stage, 'new'),
    gte(leads.createdAt, new Date(now.getTime() - DAYS * 24 * 3600 * 1000)),
    fromAd,
    notExists(
      db
        .select({ one: sql`1` })
        .from(leadActivities)
        .where(and(eq(leadActivities.leadId, leads.id), eq(leadActivities.kind, 'call'))),
    ),
    all ? undefined : eq(leads.ownerUserId, userId),
  );
  const [counted] = await db.select({ total: sql<number>`count(*)::int` }).from(leads).where(where);
  const rows = await db
    .select({
      id: leads.id,
      name: leads.name,
      city: leads.city,
      createdAt: leads.createdAt,
      campaignCode: leads.campaignCode,
      campaignName: leadCampaigns.name,
      adId: leads.adId,
      adHeadline: leads.adHeadline,
      utmCampaign: leads.utmCampaign,
    })
    .from(leads)
    .leftJoin(leadCampaigns, eq(leadCampaigns.code, leads.campaignCode))
    .where(where)
    .orderBy(desc(leads.createdAt))
    .limit(5);
  return {
    count: counted?.total ?? 0,
    leads: rows.map((row) => ({
      id: row.id,
      name: row.name,
      city: row.city,
      campaign: campaignLabel(row) ?? 'Ad',
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
