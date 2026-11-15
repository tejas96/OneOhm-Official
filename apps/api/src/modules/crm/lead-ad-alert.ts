import { createHash } from 'node:crypto';
import { type DatabaseExecutor, type LeadAttribution, marketingCampaigns } from '@oneohm/database';
import type { LeadSource } from '@oneohm/domain';
import { eq } from 'drizzle-orm';

/**
 * True when the lead came from an ad: Google, an ad or click id, a platform lead id (so an
 * Instagram or Facebook lead counts only when it carries an ad id or a lead form id, not a
 * plain message), or a campaign code that belongs to a campaign made in Marketing.
 */
export async function cameFromAd(
  db: DatabaseExecutor,
  source: LeadSource,
  attribution: LeadAttribution | undefined,
): Promise<boolean> {
  if (source === 'google') return true;
  if (!attribution) return false;
  const { adId, platformLeadId, ctwaClid, gclid, fbclid, campaignCode } = attribution;
  if (adId || platformLeadId || ctwaClid || gclid || fbclid) return true;
  if (!campaignCode) return false;
  const [row] = await db
    .select({ id: marketingCampaigns.id })
    .from(marketingCampaigns)
    .where(eq(marketingCampaigns.code, campaignCode))
    .limit(1);
  return Boolean(row);
}

/**
 * The alert's words for an ad lead: ad leads go cold fast, so the owner is told to call at
 * once. A person who was already a lead and wrote again from an ad "came back".
 */
export function adLeadAlert(lead: {
  name: string;
  city: string;
  from: string;
  cameBack?: boolean;
}) {
  return {
    title: lead.cameBack
      ? `${lead.name} came back from an ad · call now`
      : 'New ad lead · call now',
    body: lead.cameBack
      ? `${lead.name}, ${lead.city}. From ${lead.from}. Call within 5 minutes: they just wrote again.`
      : `${lead.name}, ${lead.city}. From ${lead.from}. Call within 5 minutes: ad leads go cold fast.`,
  };
}

/**
 * What makes one arrival different from another, for the alert's dedupe key: the platform's
 * lead id when there is one, else a short hash of the first note (it carries the message),
 * so an alert earlier today never swallows a new one.
 */
export function arrivalKey(input: {
  readonly firstNote: string;
  readonly attribution?: LeadAttribution | undefined;
}): string {
  return (
    input.attribution?.platformLeadId ??
    createHash('sha1').update(input.firstNote).digest('hex').slice(0, 16)
  );
}
