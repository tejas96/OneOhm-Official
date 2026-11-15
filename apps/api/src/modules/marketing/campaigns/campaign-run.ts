import { Logger } from '@nestjs/common';
import { marketingAds, marketingCampaigns, marketingPlacements } from '@oneohm/database';
import {
  adPlatform,
  errorDetail,
  type MetaDetails,
  plainError,
  publishCampaignPosts,
  queueCampaignMessages,
  readConnection,
  saveConnection,
  whatsappResult,
} from '@oneohm/marketing';
import { and, eq } from 'drizzle-orm';
import type { CampaignRow, PlacementRow } from './campaign-card';
import { type CampaignContext, runContextOf } from './campaign-context';
import { claimCampaign, claimPlacement } from './launch-claim';
import { currencyWords, noteAuthFailure } from './launch-guard';
import { buildLaunchInput, launchMediaOf } from './launch-input';

const log = new Logger('MarketingLaunch');

const CONNECT_FIRST = { meta: 'Connect Meta first', google: 'Connect Google first' } as const;

/** A campaign is live once any place is running, in review, sent or posted. */
export function campaignStateAfter(
  placements: readonly string[],
  goal: string,
): 'live' | 'posted' | 'failed' {
  const running = placements.some((state) =>
    ['live', 'in_review', 'sent', 'posted'].includes(state),
  );
  if (!running) return 'failed';
  return goal === 'post' ? 'posted' : 'live';
}

async function savePlacement(
  ctx: CampaignContext,
  placement: PlacementRow,
  values: Partial<typeof marketingPlacements.$inferInsert>,
) {
  await ctx.db
    .update(marketingPlacements)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(marketingPlacements.id, placement.id));
}

async function launchAdPlacement(
  ctx: CampaignContext,
  campaign: CampaignRow,
  placement: PlacementRow,
) {
  const provider = placement.provider as 'meta' | 'google';
  const platform = await adPlatform(ctx.db, ctx.config, provider);
  if (!platform) {
    await savePlacement(ctx, placement, { state: 'failed', lastError: CONNECT_FIRST[provider] });
    return;
  }
  const connection = await readConnection(ctx.db, provider, ctx.config.mode);
  const wrongMoney = currencyWords(provider, connection?.currency);
  if (wrongMoney) {
    await savePlacement(ctx, placement, { state: 'failed', lastError: wrongMoney });
    return;
  }
  const media = await launchMediaOf(ctx, campaign.mediaId);
  if (!media) {
    await savePlacement(ctx, placement, {
      state: 'failed',
      lastError: 'The photo for this campaign is missing. Add it again.',
    });
    return;
  }
  try {
    const input = await buildLaunchInput(ctx, campaign, placement, media);
    const result = await platform.launch(input, (ids) =>
      savePlacement(ctx, placement, { externalIds: ids }),
    );
    await savePlacement(ctx, placement, {
      state: result.state,
      externalId: result.externalId,
      externalIds: result.externalIds,
      notes: [...result.notes],
      lastError: null,
    });
    if (result.ads.length > 0) {
      await ctx.db
        .insert(marketingAds)
        .values(
          result.ads.map((ad) => ({
            provider,
            externalId: ad.externalId,
            campaignId: campaign.id,
            name: ad.name,
          })),
        )
        .onConflictDoNothing();
    }
    const status = result.externalIds.statusPlacement;
    if (provider === 'meta' && status) {
      await saveConnection(ctx.db, ctx.config.secretKey, 'meta', {
        details: { statusPlacement: status as NonNullable<MetaDetails['statusPlacement']> },
      });
    }
  } catch (error) {
    log.warn(`${provider} launch for ${campaign.code} failed: ${errorDetail(error)}`);
    await savePlacement(ctx, placement, { state: 'failed', lastError: plainError(error) });
    await noteAuthFailure(ctx, provider, error);
  }
}

async function sendWhatsApp(ctx: CampaignContext, campaign: CampaignRow, placement: PlacementRow) {
  try {
    const count = await queueCampaignMessages(ctx.db, campaign.id, await runContextOf(ctx));
    await savePlacement(ctx, placement, whatsappResult(count));
  } catch (error) {
    log.warn(`WhatsApp send for ${campaign.code} failed: ${errorDetail(error)}`);
    await savePlacement(ctx, placement, { state: 'failed', lastError: plainError(error) });
  }
}

/**
 * Starts the campaign now: a post goes out on its places; chats and lead forms start on Meta and
 * Google, and the WhatsApp message is queued. Each place keeps its own result. With
 * `onlyFailed`, only places that failed before try again (their saved ids resume the work).
 */
export async function runCampaign(
  ctx: CampaignContext,
  campaignId: string,
  options: { onlyFailed?: boolean } = {},
): Promise<void> {
  const [campaign] = await ctx.db
    .select()
    .from(marketingCampaigns)
    .where(eq(marketingCampaigns.id, campaignId));
  if (!campaign) throw new Error('Campaign not found.');
  // Take the campaign, then each place, in single statements: a second click finds nothing to do.
  if (options.onlyFailed && !(await claimCampaign(ctx, campaignId, ['failed']))) return;
  const startable = options.onlyFailed
    ? (['failed'] as const)
    : (['pending', 'scheduled'] as const);
  const all = await ctx.db
    .select({ id: marketingPlacements.id })
    .from(marketingPlacements)
    .where(eq(marketingPlacements.campaignId, campaignId));
  const todo: PlacementRow[] = [];
  for (const { id } of all) {
    const claimed = await claimPlacement(ctx, id, startable);
    if (claimed) todo.push(claimed);
  }
  if (todo.length === 0) {
    if (options.onlyFailed) {
      await ctx.db
        .update(marketingCampaigns)
        .set({ state: 'failed', updatedAt: new Date() })
        .where(eq(marketingCampaigns.id, campaignId));
    }
    return;
  }
  if (!options.onlyFailed) await claimCampaign(ctx, campaignId, ['scheduled']);
  if (campaign.goal === 'post') {
    await publishCampaignPosts(ctx.db, ctx.config, campaignId, await runContextOf(ctx));
    return;
  }
  await Promise.all(
    todo.map((place) =>
      place.provider === 'whatsapp'
        ? sendWhatsApp(ctx, campaign, place)
        : launchAdPlacement(ctx, campaign, place),
    ),
  );
  const after = await ctx.db
    .select({ state: marketingPlacements.state })
    .from(marketingPlacements)
    .where(eq(marketingPlacements.campaignId, campaignId));
  await ctx.db
    .update(marketingCampaigns)
    .set({
      state: campaignStateAfter(
        after.map((row) => row.state),
        campaign.goal,
      ),
      launchedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(marketingCampaigns.id, campaignId)));
}
