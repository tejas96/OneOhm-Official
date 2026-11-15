import {
  type DatabaseExecutor,
  type LeadAttribution,
  marketingAds,
  marketingCampaigns,
  marketingClicks,
} from '@oneohm/database';
import { findClickRef } from '@oneohm/domain';
import { and, eq, isNull } from 'drizzle-orm';
import type { IntakeAttribution } from '../../crm/lead-intake.service';
import type { Incoming } from '../whatsapp-events';

/** Our campaign code for a Meta ad id, or null when the ad is not one we made. */
export async function campaignCodeOfAd(db: DatabaseExecutor, adId: string): Promise<string | null> {
  const [row] = await db
    .select({ code: marketingCampaigns.code })
    .from(marketingAds)
    .innerJoin(marketingCampaigns, eq(marketingCampaigns.id, marketingAds.campaignId))
    .where(and(eq(marketingAds.provider, 'meta'), eq(marketingAds.externalId, adId)))
    .limit(1);
  return row?.code ?? null;
}

/**
 * The landing-page visit behind a "#ref" in the opener: its id and click ids. Only a visit
 * of the campaign the message names, and one no lead has claimed yet, counts.
 */
export async function clickOfRef(db: DatabaseExecutor, ref: string, campaignCode: string) {
  const [row] = await db
    .select({
      id: marketingClicks.id,
      gclid: marketingClicks.gclid,
      fbclid: marketingClicks.fbclid,
      code: marketingCampaigns.code,
    })
    .from(marketingClicks)
    .innerJoin(marketingCampaigns, eq(marketingCampaigns.id, marketingClicks.campaignId))
    .where(
      and(
        eq(marketingClicks.ref, ref),
        eq(marketingCampaigns.code, campaignCode),
        isNull(marketingClicks.leadId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Adds what only our own tables know to an entry read from the message: the campaign of the
 * Meta ad (when the text names no code) and the Google or Facebook click behind a landing-page
 * opener (its id is kept so the lead made later claims it). Anything the message already said
 * is kept.
 */
export async function withAdLinks(
  db: DatabaseExecutor,
  entry: LeadAttribution,
  incoming: Incoming,
): Promise<IntakeAttribution> {
  let found: IntakeAttribution = entry;
  if (!found.campaignCode && found.adId) {
    const code = await campaignCodeOfAd(db, found.adId);
    if (code) found = { ...found, campaignCode: code };
  }
  const ref = incoming.kind === 'text' ? findClickRef(incoming.text) : null;
  const click = ref && found.campaignCode ? await clickOfRef(db, ref, found.campaignCode) : null;
  if (!click) return found;
  return {
    ...found,
    clickId: click.id,
    ...(click.gclid ? { gclid: click.gclid } : {}),
    ...(click.fbclid ? { fbclid: click.fbclid } : {}),
  };
}
