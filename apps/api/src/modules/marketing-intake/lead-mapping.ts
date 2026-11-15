import { findIndianMobile } from '@oneohm/domain';
import type { PlatformLead } from '@oneohm/marketing';
import type { IntakeInput } from '../crm/lead-intake.service';
import type { AdCampaign } from './ad-lookup';

export const PLATFORM_WORDS = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  google: 'Google',
} as const;

/** The city a lead gets: what they gave, else the campaign's, else Marketing's default. */
export const leadCity = (
  given: string | null | undefined,
  campaign: AdCampaign | null,
  fallback: string,
) => given?.trim() || campaign?.city || fallback || 'Not given';

/**
 * A lead form entry as lead intake input, or null when the number is missing or not an
 * Indian mobile (there is no one to call). `prefix` marks the platform id (`meta`, `google`).
 */
export function formLeadInput(
  lead: PlatformLead,
  campaign: AdCampaign | null,
  defaultCity: string,
  prefix: 'meta' | 'google',
  adId: string | null,
): IntakeInput | null {
  const phone = lead.phone ? findIndianMobile(lead.phone) : null;
  if (!phone) return null;
  const platform = PLATFORM_WORDS[lead.platform];
  return {
    name: lead.name?.trim() || `${platform} lead`,
    phone,
    city: leadCity(lead.city, campaign, defaultCity),
    source: lead.platform,
    nextActionNote: `Call now: ${prefix === 'meta' ? 'ad' : 'Google'} lead form`,
    firstNote: `Filled the ${platform} lead form`,
    attribution: {
      ...(campaign ? { campaignCode: campaign.code } : {}),
      ...(adId ? { adId } : {}),
      ...(campaign?.adName ? { adHeadline: campaign.adName } : {}),
      ...(lead.gclid ? { gclid: lead.gclid } : {}),
      platformLeadId: `${prefix}:${lead.platformLeadId}`,
    },
  };
}
