import {
  type DatabaseExecutor,
  leads,
  marketingAds,
  marketingCampaigns,
  marketingPlacements,
  readBusinessSetting,
} from '@oneohm/database';
import { and, eq, ne } from 'drizzle-orm';

/** Our campaign behind an ad or a Google campaign id. */
export interface AdCampaign {
  readonly id: string;
  readonly code: string;
  readonly city: string;
  /** The ad's name, when the platform id was an ad. */
  readonly adName: string | null;
}

/** Our campaign for a Meta ad id, or null when we did not make that ad. */
export async function campaignOfMetaAd(
  db: DatabaseExecutor,
  adId: string,
): Promise<AdCampaign | null> {
  const [row] = await db
    .select({
      id: marketingCampaigns.id,
      code: marketingCampaigns.code,
      city: marketingCampaigns.city,
      name: marketingAds.name,
    })
    .from(marketingAds)
    .innerJoin(marketingCampaigns, eq(marketingCampaigns.id, marketingAds.campaignId))
    .where(and(eq(marketingAds.provider, 'meta'), eq(marketingAds.externalId, adId)))
    .limit(1);
  return row ? { id: row.id, code: row.code, city: row.city, adName: row.name } : null;
}

/** Our campaign for a Google campaign id, or null. */
export async function campaignOfGoogle(
  db: DatabaseExecutor,
  externalId: string,
): Promise<AdCampaign | null> {
  const [row] = await db
    .select({
      id: marketingCampaigns.id,
      code: marketingCampaigns.code,
      city: marketingCampaigns.city,
    })
    .from(marketingPlacements)
    .innerJoin(marketingCampaigns, eq(marketingCampaigns.id, marketingPlacements.campaignId))
    .where(
      and(
        eq(marketingPlacements.provider, 'google'),
        eq(marketingPlacements.externalId, externalId),
      ),
    )
    .limit(1);
  return row ? { id: row.id, code: row.code, city: row.city, adName: null } : null;
}

/** Our campaign by its code (for a chat that remembers it). */
export async function campaignOfCode(
  db: DatabaseExecutor,
  code: string,
): Promise<AdCampaign | null> {
  const [row] = await db
    .select({
      id: marketingCampaigns.id,
      code: marketingCampaigns.code,
      city: marketingCampaigns.city,
    })
    .from(marketingCampaigns)
    .where(eq(marketingCampaigns.code, code))
    .limit(1);
  return row ? { id: row.id, code: row.code, city: row.city, adName: null } : null;
}

/** True when a lead with this platform id already exists. */
export async function leadWithPlatformId(
  db: DatabaseExecutor,
  platformLeadId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.platformLeadId, platformLeadId))
    .limit(1);
  return Boolean(row);
}

/** The city Marketing settings name for leads that give none ('' when not set). */
export async function settingsCity(db: DatabaseExecutor): Promise<string> {
  return (await readBusinessSetting(db, 'marketing')).defaultCity.trim();
}

/**
 * A city the person named in their message ("my number 98…, Sangli"), matched against the
 * cities leads already came from; null when none is named. Whole words only, any case.
 */
export async function cityInMessage(db: DatabaseExecutor, text: string): Promise<string | null> {
  const words = ` ${text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')} `;
  if (words.trim().length === 0) return null;
  const rows = await db
    .selectDistinct({ city: leads.city })
    .from(leads)
    .where(ne(leads.city, 'Not given'))
    .limit(500);
  const named = rows
    .map((row) => row.city.trim())
    .filter((city) => city.length >= 3 && words.includes(` ${city.toLowerCase()} `))
    .sort((a, b) => b.length - a.length);
  return named[0] ?? null;
}
