import type { CampaignDetail, NewCampaignInput } from '@oneohm/api-contracts';
import {
  leadCampaigns,
  marketingCampaigns,
  marketingMedia,
  marketingPlacements,
} from '@oneohm/database';
import {
  type CampaignChannel,
  campaignCodeFrom,
  campaignNameOf,
  paidProviders,
  providerOf,
  splitBudget,
} from '@oneohm/domain';
import { readConnection, segmentPeople } from '@oneohm/marketing';
import { todayIn } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../../common/audit';
import type { Actor } from '../../../common/auth/actor';
import { invalid } from '../../../common/http/errors';
import type { CampaignContext } from './campaign-context';
import { readDetail } from './campaign-detail.read';
import { runCampaign } from './campaign-run';
import { currencyWords } from './launch-guard';
import { launchProblem } from './launch-validation';

/** The places a campaign runs on, one row each: Meta, Google, WhatsApp. */
export function placementProviders(channels: readonly CampaignChannel[]) {
  const providers = new Set(channels.map(providerOf));
  return (['meta', 'google', 'whatsapp'] as const).filter((provider) => providers.has(provider));
}

/**
 * Makes the code, the campaign and one row per place in one go, and starts it unless it is set
 * for later. Returns the finished detail.
 */
export async function launchCampaign(
  ctx: CampaignContext,
  actor: Actor,
  input: NewCampaignInput,
  copiedFromId: string | null = null,
): Promise<CampaignDetail> {
  const { db } = ctx;
  const [media] = await db
    .select({ kind: marketingMedia.kind })
    .from(marketingMedia)
    .where(eq(marketingMedia.id, input.mediaId));
  const problem = launchProblem(input, media?.kind ?? null, new Date());
  if (problem) throw invalid(problem.message, { [problem.field]: problem.message });
  for (const provider of paidProviders(input.goal, input.channels)) {
    if (provider !== 'meta' && provider !== 'google') continue;
    const connection = await readConnection(db, provider, ctx.config.mode);
    const wrongMoney = currencyWords(provider, connection?.currency);
    if (wrongMoney) throw invalid(wrongMoney, { channels: wrongMoney });
  }
  // A message to own contacts alone, sent now, to nobody would show as "live" while doing
  // nothing: say so before anything is made.
  if (input.channels.length === 1 && input.channels[0] === 'whatsapp' && !input.startsAt) {
    const today = todayIn('Asia/Kolkata');
    let people = 0;
    for (const segment of new Set(input.segments))
      people += (await segmentPeople(db, segment, today)).length;
    if (people === 0) {
      const words =
        'Nobody in these lists right now, so there is no one to message. Pick another list.';
      throw invalid(words, { segments: words });
    }
  }
  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  const shares = splitBudget(input.dailyBudgetPaise, paidProviders(input.goal, input.channels));
  const campaignId = await db.transaction(async (tx) => {
    const taken = await tx.select({ code: leadCampaigns.code }).from(leadCampaigns);
    const code = campaignCodeFrom(input.text, new Set(taken.map((row) => row.code)));
    await tx.insert(leadCampaigns).values({ code, name: campaignNameOf(input.text, code) });
    const [campaign] = await tx
      .insert(marketingCampaigns)
      .values({
        code,
        name: campaignNameOf(input.text, code),
        goal: input.goal,
        state: startsAt ? 'scheduled' : 'launching',
        text: input.text,
        mediaId: input.mediaId,
        channels: [...new Set(input.channels)],
        city: input.city,
        dailyBudgetPaise: input.dailyBudgetPaise,
        segments: input.channels.includes('whatsapp') ? [...new Set(input.segments)] : [],
        startsAt,
        copiedFromId,
        createdByUserId: actor.userId,
      })
      .returning({ id: marketingCampaigns.id });
    if (!campaign) throw new Error('Campaign insert returned nothing');
    await tx.insert(marketingPlacements).values(
      placementProviders(input.channels).map((provider) => ({
        campaignId: campaign.id,
        provider,
        state: startsAt ? ('scheduled' as const) : ('pending' as const),
        dailyBudgetPaise: provider === 'whatsapp' ? 0 : (shares[provider] ?? 0),
      })),
    );
    await recordAudit(
      tx,
      actor.userId,
      'marketing.campaign_created',
      'marketing_campaign',
      campaign.id,
      {
        code,
        goal: input.goal,
        channels: input.channels,
        dailyBudgetPaise: input.dailyBudgetPaise,
        copiedFromId,
      },
    );
    return campaign.id;
  });
  if (!startsAt) await runCampaign(ctx, campaignId);
  return readDetail(db, ctx.env.API_PUBLIC_URL, campaignId);
}
