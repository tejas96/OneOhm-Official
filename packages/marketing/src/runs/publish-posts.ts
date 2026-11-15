import {
  type DatabaseExecutor,
  marketingCampaigns,
  marketingMedia,
  marketingPlacements,
} from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import type { MarketingConfig } from '../config';
import { plainError } from '../errors';
import { metaTools } from '../factory';
import type { LaunchMedia } from '../types';
import { queueCampaignMessages, whatsappResult } from './queue-messages';
import { mediaPublicUrl, type RunContext } from './run-types';

type PostChannel = 'instagram' | 'facebook';

/** How one channel's post went: its id, or the plain words for why not. */
export interface PostResult {
  readonly channel: PostChannel;
  readonly postId: string | null;
  readonly error: string | null;
}

const NAME: Record<PostChannel, string> = { instagram: 'Instagram', facebook: 'Facebook' };

/**
 * One result for the Meta placement: posted when any channel worked (the ones that did not are
 * noted), failed when none did.
 */
export function postOutcome(results: readonly PostResult[]) {
  const worked = results.filter((result) => result.postId);
  const failed = results.filter((result) => !result.postId);
  const ids: Record<string, string> = {};
  for (const result of worked) ids[`${result.channel}Post`] = result.postId as string;
  return {
    state: worked.length > 0 ? ('posted' as const) : ('failed' as const),
    ids,
    notes: failed.map((result) => `${NAME[result.channel]}: ${result.error ?? 'did not post.'}`),
    lastError:
      worked.length > 0 ? null : (failed[0]?.error ?? 'Nothing was posted. Please try again.'),
  };
}

/**
 * Publishes the campaign's Instagram and Facebook posts now and records each placement's result
 * (posted or failed with plain words). Channels that already posted are not posted again, so
 * Try again only repeats what failed. Also sends the WhatsApp message when the campaign has it.
 */
export async function publishCampaignPosts(
  db: DatabaseExecutor,
  config: MarketingConfig,
  campaignId: string,
  context: RunContext,
): Promise<void> {
  const [campaign] = await db
    .select({
      text: marketingCampaigns.text,
      channels: marketingCampaigns.channels,
      mediaId: marketingCampaigns.mediaId,
    })
    .from(marketingCampaigns)
    .where(eq(marketingCampaigns.id, campaignId));
  if (!campaign) throw new Error('Campaign not found.');
  const placements = await db
    .select()
    .from(marketingPlacements)
    .where(eq(marketingPlacements.campaignId, campaignId));
  const placementOf = (provider: 'meta' | 'whatsapp') =>
    placements.find((row) => row.provider === provider);
  const save = (
    provider: 'meta' | 'whatsapp',
    values: Partial<typeof marketingPlacements.$inferInsert>,
  ) =>
    db
      .update(marketingPlacements)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(marketingPlacements.campaignId, campaignId),
          eq(marketingPlacements.provider, provider),
        ),
      );

  const meta = placementOf('meta');
  if (meta && meta.state !== 'posted') {
    const channels = (['instagram', 'facebook'] as const).filter((channel) =>
      campaign.channels.includes(channel),
    );
    await save('meta', await postToMeta(db, config, campaign, meta.externalIds, channels, context));
  }
  const whatsapp = placementOf('whatsapp');
  if (whatsapp && whatsapp.state !== 'sent' && campaign.channels.includes('whatsapp')) {
    try {
      const count = await queueCampaignMessages(db, campaignId, context);
      await save('whatsapp', whatsappResult(count));
    } catch (error) {
      await save('whatsapp', { state: 'failed', lastError: plainError(error) });
    }
  }
  const after = await db
    .select({ state: marketingPlacements.state })
    .from(marketingPlacements)
    .where(eq(marketingPlacements.campaignId, campaignId));
  const done = after.some((row) => row.state === 'posted' || row.state === 'sent');
  await db
    .update(marketingCampaigns)
    .set({ state: done ? 'posted' : 'failed', launchedAt: new Date(), updatedAt: new Date() })
    .where(eq(marketingCampaigns.id, campaignId));
}

async function postToMeta(
  db: DatabaseExecutor,
  config: MarketingConfig,
  campaign: { text: string; mediaId: string | null },
  previous: unknown,
  channels: readonly PostChannel[],
  context: RunContext,
) {
  const tools = await metaTools(db, config);
  if (!tools) return { state: 'failed' as const, lastError: 'Connect Meta first.' };
  const [media] = campaign.mediaId
    ? await db.select().from(marketingMedia).where(eq(marketingMedia.id, campaign.mediaId))
    : [];
  if (!media || !campaign.mediaId) {
    return { state: 'failed' as const, lastError: 'The photo for this post is missing.' };
  }
  const launchMedia: LaunchMedia = {
    kind: media.kind,
    publicUrl: mediaPublicUrl(context.apiPublicUrl, campaign.mediaId),
    fileName: media.fileName,
    contentType: media.contentType,
    width: media.width,
    height: media.height,
    bytes: () => Promise.reject(new Error('Posts use the public link, not the file bytes.')),
    crops: null,
  };
  const before = (previous ?? {}) as Record<string, string>;
  const results: PostResult[] = [];
  for (const channel of channels) {
    const earlier = before[`${channel}Post`];
    if (earlier) {
      results.push({ channel, postId: earlier, error: null });
      continue;
    }
    try {
      const posted = await tools.publishPost({ channel, text: campaign.text, media: launchMedia });
      results.push({ channel, postId: posted.postId, error: null });
    } catch (error) {
      results.push({ channel, postId: null, error: plainError(error) });
    }
  }
  const outcome = postOutcome(results);
  return {
    state: outcome.state,
    externalIds: { ...before, ...outcome.ids },
    notes: outcome.notes,
    lastError: outcome.lastError,
  };
}
