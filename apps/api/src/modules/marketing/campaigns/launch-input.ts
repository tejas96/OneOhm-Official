import {
  companyProfile,
  type DatabaseExecutor,
  marketingAudiences,
  marketingMedia,
  readBusinessSetting,
} from '@oneohm/database';
import { headlineOf } from '@oneohm/domain';
import {
  type AdProvider,
  type LaunchInput,
  type LaunchMedia,
  landingPageUrl,
  mediaPublicUrl,
  type PlatformIds,
} from '@oneohm/marketing';
import { and, eq } from 'drizzle-orm';
import { businessWhatsAppNumber } from '../../whatsapp/business-number';
import type { CampaignRow, PlacementRow } from './campaign-card';
import type { CampaignContext } from './campaign-context';
import { googleCrops, squareLogo } from './media-crops';

/** The campaign's photo or video, readable by the platforms (null when it is gone). */
export async function launchMediaOf(
  ctx: CampaignContext,
  mediaId: string | null,
): Promise<LaunchMedia | null> {
  if (!mediaId) return null;
  const [row] = await ctx.db.select().from(marketingMedia).where(eq(marketingMedia.id, mediaId));
  if (!row) return null;
  const bytes = () => ctx.storage.getBuffer(row.storageKey);
  return {
    kind: row.kind,
    publicUrl: mediaPublicUrl(ctx.env.API_PUBLIC_URL, row.id),
    fileName: row.fileName,
    contentType: row.contentType,
    width: row.width,
    height: row.height,
    bytes,
    crops: row.kind === 'image' ? googleCrops(bytes) : null,
  };
}

async function logoOf(ctx: CampaignContext, logoKey: string | null) {
  if (!logoKey) return null;
  return async () => squareLogo(await ctx.storage.getBuffer(logoKey));
}

async function audiencesOf(db: DatabaseExecutor, provider: AdProvider) {
  const rows = await db
    .select({ kind: marketingAudiences.kind, externalId: marketingAudiences.externalId })
    .from(marketingAudiences)
    .where(and(eq(marketingAudiences.provider, provider), eq(marketingAudiences.status, 'ready')));
  const idOf = (kind: string) => rows.find((row) => row.kind === kind)?.externalId ?? null;
  return {
    interested: idOf('interested'),
    customers: idOf('customers'),
    lookalike: idOf('lookalike'),
  };
}

/** Everything one ad platform needs to start this campaign's placement. */
export async function buildLaunchInput(
  ctx: CampaignContext,
  campaign: CampaignRow,
  placement: PlacementRow,
  media: LaunchMedia,
): Promise<LaunchInput> {
  const { db, env } = ctx;
  const settings = await readBusinessSetting(db, 'marketing');
  const [profile] = await db
    .select({ brandName: companyProfile.brandName, logoKey: companyProfile.logoKey })
    .from(companyProfile)
    .limit(1);
  const landingUrl = landingPageUrl(env.API_PUBLIC_URL, campaign.code);
  const provider = placement.provider as AdProvider;
  return {
    code: campaign.code,
    name: campaign.name,
    goal: campaign.goal === 'lead_form' ? 'lead_form' : 'chats',
    channels: campaign.channels.filter(
      (channel): channel is 'instagram' | 'facebook' =>
        channel === 'instagram' || channel === 'facebook',
    ),
    headline: headlineOf(campaign.text),
    text: campaign.text,
    media,
    city: { name: campaign.city, latitude: null, longitude: null, radiusKm: settings.radiusKm },
    dailyBudgetPaise: placement.dailyBudgetPaise,
    landingUrl,
    privacyPolicyUrl: settings.privacyPolicyUrl || `${landingUrl}/privacy`,
    businessName: profile?.brandName ?? 'OneOhm',
    logo: await logoOf(ctx, profile?.logoKey ?? null),
    whatsappNumber: await businessWhatsAppNumber(env),
    openerText: `Hi OneOhm ${campaign.code}`,
    audiences: await audiencesOf(db, provider),
    leadWebhookUrl: `${env.API_PUBLIC_URL.replace(/\/$/, '')}/v1/webhooks/google-leads`,
    previous: placement.externalIds as PlatformIds,
  };
}
