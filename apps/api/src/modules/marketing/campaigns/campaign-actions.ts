import { Logger } from '@nestjs/common';
import type { CampaignDetail } from '@oneohm/api-contracts';
import {
  marketingCampaigns,
  marketingMessages,
  marketingPlacements,
  outbox,
} from '@oneohm/database';
import type { CampaignChannel, MessageSegment } from '@oneohm/domain';
import { adPlatform, errorDetail, type PlatformState, plainError } from '@oneohm/marketing';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { recordAudit } from '../../../common/audit';
import type { Actor } from '../../../common/auth/actor';
import { conflict } from '../../../common/http/errors';
import type { PlacementRow } from './campaign-card';
import { readCard } from './campaign-cards.read';
import type { CampaignContext } from './campaign-context';
import { launchCampaign } from './campaign-create';
import { readDetail } from './campaign-detail.read';
import { runCampaign } from './campaign-run';
import { noteAuthFailure, platformIdOf } from './launch-guard';

const log = new Logger('MarketingActions');
const NAME = { meta: 'Meta', google: 'Google' } as const;

/**
 * Asks each Meta and Google place that has something running to change state. Returns, for each
 * place, the plain words for a failure or null when it worked.
 */
async function changeAdPlaces(
  ctx: CampaignContext,
  places: readonly PlacementRow[],
  state: PlatformState,
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  for (const place of places) {
    const provider = place.provider as 'meta' | 'google';
    const externalId = platformIdOf(place);
    // Nothing was ever made on the platform: there is nothing to call.
    if (!externalId) continue;
    const platform = await adPlatform(ctx.db, ctx.config, provider);
    if (!platform) {
      result.set(place.id, `Connect ${NAME[provider]} first, then try again.`);
      continue;
    }
    try {
      await platform.setState(
        { externalId, externalIds: place.externalIds as Record<string, string> },
        state,
      );
      result.set(place.id, null);
    } catch (error) {
      log.warn(`${provider} ${state} failed: ${errorDetail(error)}`);
      result.set(place.id, plainError(error));
      await noteAuthFailure(ctx, provider, error);
    }
  }
  return result;
}

async function placementsOf(ctx: CampaignContext, id: string) {
  return ctx.db.select().from(marketingPlacements).where(eq(marketingPlacements.campaignId, id));
}

async function setPlace(
  ctx: CampaignContext,
  id: string,
  values: Partial<typeof marketingPlacements.$inferInsert>,
) {
  await ctx.db
    .update(marketingPlacements)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(marketingPlacements.id, id));
}

async function setCampaign(
  ctx: CampaignContext,
  id: string,
  values: Partial<typeof marketingCampaigns.$inferInsert>,
) {
  await ctx.db
    .update(marketingCampaigns)
    .set({ ...values, updatedAt: new Date(), version: sql`${marketingCampaigns.version} + 1` })
    .where(eq(marketingCampaigns.id, id));
}

/** Pauses every place of a live campaign. A place that cannot be paused says why. */
export async function pauseCampaign(
  ctx: CampaignContext,
  actor: Actor,
  id: string,
): Promise<CampaignDetail> {
  const { row } = await readCard(ctx.db, id);
  if (row.state !== 'live') throw conflict('Only a live campaign can be paused.');
  const places = (await placementsOf(ctx, id)).filter(
    (place) =>
      place.provider !== 'whatsapp' &&
      (platformIdOf(place) !== null || ['live', 'in_review'].includes(place.state)),
  );
  const results = await changeAdPlaces(ctx, places, 'paused');
  for (const place of places) {
    const problem = results.get(place.id) ?? null;
    await setPlace(
      ctx,
      place.id,
      problem ? { lastError: problem } : { state: 'paused', lastError: null },
    );
  }
  const paused = places.filter((place) => (results.get(place.id) ?? null) === null);
  // A place with no ids was never made, so it counts as paused without a call.
  if (places.length > 0 && paused.length === 0) {
    throw conflict([...results.values()].find(Boolean) ?? 'Could not pause. Please try again.');
  }
  await setCampaign(ctx, id, { state: 'paused' });
  await recordAudit(ctx.db, actor.userId, 'marketing.campaign_paused', 'marketing_campaign', id);
  return readDetail(ctx.db, ctx.env.API_PUBLIC_URL, id);
}

/** Stops a campaign for good: ads off, waiting WhatsApp messages cancelled. */
export async function stopCampaign(
  ctx: CampaignContext,
  actor: Actor,
  id: string,
): Promise<CampaignDetail> {
  const { row } = await readCard(ctx.db, id);
  if (!['live', 'paused', 'scheduled', 'failed'].includes(row.state)) {
    throw conflict('This campaign cannot be stopped now.');
  }
  const places = await placementsOf(ctx, id);
  const results = await changeAdPlaces(
    ctx,
    places.filter((place) => place.provider !== 'whatsapp'),
    'stopped',
  );
  for (const place of places) {
    const problem = results.get(place.id) ?? null;
    await setPlace(
      ctx,
      place.id,
      problem
        ? {
            lastError: `${problem} Stop it in ${NAME[place.provider as 'meta' | 'google']} Ads too.`,
          }
        : { state: 'stopped', lastError: null },
    );
  }
  await ctx.db
    .update(outbox)
    .set({ status: 'skipped', lastError: 'Campaign stopped' })
    .where(
      and(
        eq(outbox.status, 'pending'),
        inArray(
          outbox.id,
          ctx.db
            .select({ id: marketingMessages.outboxId })
            .from(marketingMessages)
            .where(eq(marketingMessages.campaignId, id)),
        ),
      ),
    );
  await setCampaign(ctx, id, { state: 'stopped', stoppedAt: new Date() });
  await recordAudit(ctx.db, actor.userId, 'marketing.campaign_stopped', 'marketing_campaign', id);
  return readDetail(ctx.db, ctx.env.API_PUBLIC_URL, id);
}

async function resume(ctx: CampaignContext, id: string) {
  const places = (await placementsOf(ctx, id)).filter(
    (place) => place.provider !== 'whatsapp' && place.state === 'paused',
  );
  const results = await changeAdPlaces(ctx, places, 'active');
  for (const place of places) {
    const problem = results.get(place.id) ?? null;
    await setPlace(
      ctx,
      place.id,
      problem ? { lastError: problem } : { state: 'live', lastError: null },
    );
  }
  if (places.length > 0 && places.every((place) => (results.get(place.id) ?? null) !== null)) {
    throw conflict([...results.values()].find(Boolean) ?? 'Could not resume. Please try again.');
  }
  await setCampaign(ctx, id, { state: 'live' });
}

/**
 * Paused: resumes it. Failed: tries the failed places again. Stopped or posted: makes a copy with
 * a new code and starts it.
 */
export async function runAgain(
  ctx: CampaignContext,
  actor: Actor,
  id: string,
): Promise<CampaignDetail> {
  const { row } = await readCard(ctx.db, id);
  if (row.state === 'paused') await resume(ctx, id);
  else if (row.state === 'failed') {
    await runCampaign(ctx, id, { onlyFailed: true });
  } else if (row.state === 'stopped' || row.state === 'posted') {
    if (!row.mediaId) throw conflict('The photo of this campaign is gone. Make a new campaign.');
    return launchCampaign(
      ctx,
      actor,
      {
        goal: row.goal,
        text: row.text,
        mediaId: row.mediaId,
        channels: row.channels as CampaignChannel[],
        city: row.city,
        dailyBudgetPaise: row.dailyBudgetPaise,
        segments: row.segments as MessageSegment[],
        startsAt: null,
      },
      row.id,
    );
  } else throw conflict('There is nothing to run again on this campaign.');
  await recordAudit(ctx.db, actor.userId, 'marketing.campaign_run_again', 'marketing_campaign', id);
  return readDetail(ctx.db, ctx.env.API_PUBLIC_URL, id);
}
