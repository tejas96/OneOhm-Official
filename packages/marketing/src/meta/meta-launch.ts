import type { MetaAccess, MetaAppConfig } from '../access';
import { PlatformError } from '../errors';
import type { LaunchInput, LaunchResult, PlatformIds } from '../types';
import { createAdSet } from './meta-adset';
import { objectStorySpec } from './meta-creative';
import { NOT_INR } from './meta-currency';
import { type Graph, metaGraph } from './meta-graph';
import { uploadImage, uploadVideo, videoThumbnail, waitForVideo } from './meta-media';
import { realSleep, type Sleep } from './meta-sleep';

/** Finds a campaign an earlier try made (named with the code), so a retry never doubles it. */
async function findCampaign(graph: Graph, access: MetaAccess, code: string) {
  const reply = await graph.get<{ data?: { id: string; name: string }[] }>(
    `${access.adAccountId}/campaigns`,
    {
      fields: 'id,name,status',
      filtering: [{ field: 'name', operator: 'CONTAIN', value: code }],
    },
  );
  return reply.data?.find((c) => c.name.startsWith(`${code} · `))?.id ?? null;
}

async function createLeadForm(pageGraph: Graph, access: MetaAccess, input: LaunchInput) {
  const reply = await pageGraph.post<{ id: string }>(`${access.details.pageId}/leadgen_forms`, {
    name: `${input.code} · Form`,
    questions: [{ type: 'FULL_NAME' }, { type: 'PHONE' }, { type: 'CITY' }],
    privacy_policy: { url: input.privacyPolicyUrl, link_text: 'Privacy policy' },
    thank_you_page: {
      title: 'Thank you',
      body: 'We got your details and will call you soon.',
      button_type: 'VIEW_WEBSITE',
      button_text: 'See our website',
      website_url: input.landingUrl,
    },
    locale: 'EN_US',
  });
  return reply.id;
}

type Keep = (key: string, value: string) => Promise<void>;

async function ensureMedia(
  graph: Graph,
  access: MetaAccess,
  input: LaunchInput,
  ids: Record<string, string>,
  keep: Keep,
  sleep: Sleep,
) {
  let imageHash: string | null = ids.imageHash ?? null;
  let videoId: string | null = ids.videoId ?? null;
  let thumbnail: string | null = ids.thumbnail ?? null;
  if (input.media.kind === 'image') {
    if (!imageHash) {
      imageHash = await uploadImage(graph, access.adAccountId, input.media);
      await keep('imageHash', imageHash);
    }
  } else {
    if (!videoId) {
      videoId = await uploadVideo(graph, access.adAccountId, input.media);
      await keep('videoId', videoId);
    }
    if (!thumbnail) {
      await waitForVideo(graph, videoId, sleep);
      thumbnail = await videoThumbnail(graph, videoId);
      await keep('thumbnail', thumbnail);
    }
  }
  return { imageHash, videoId, thumbnail };
}

async function ensureCampaign(
  graph: Graph,
  access: MetaAccess,
  input: LaunchInput,
  ids: Record<string, string>,
  keep: Keep,
): Promise<string> {
  const found = ids.campaign ?? (await findCampaign(graph, access, input.code));
  if (found) {
    if (!ids.campaign) await keep('campaign', found);
    return found;
  }
  const made = await graph.post<{ id: string }>(`${access.adAccountId}/campaigns`, {
    name: `${input.code} · ${input.name}`,
    objective: input.goal === 'chats' ? 'OUTCOME_ENGAGEMENT' : 'OUTCOME_LEADS',
    special_ad_categories: [],
    is_adset_budget_sharing_enabled: false,
    status: 'PAUSED',
  });
  await keep('campaign', made.id);
  return made.id;
}

/** Everything is made paused and switched on last: ad, then ad set, then campaign. */
export async function launchMeta(
  access: MetaAccess,
  app: MetaAppConfig,
  input: LaunchInput,
  saveIds: (ids: PlatformIds) => Promise<void>,
  sleep: Sleep = realSleep,
): Promise<LaunchResult> {
  if (access.currency !== 'INR') throw new PlatformError('account', NOT_INR);
  const { pageId } = access.details;
  if (!pageId || !access.pageToken) {
    throw new PlatformError('invalid', 'Connect a Facebook Page to Meta first.');
  }
  if (input.goal === 'chats' && !input.whatsappNumber) {
    throw new PlatformError('invalid', 'Add your business WhatsApp number first.');
  }
  const graph = metaGraph(app, access.userToken);
  const pageGraph = metaGraph(app, access.pageToken);
  const ids: Record<string, string> = { ...input.previous };
  const notes: string[] = [];
  const keep = async (key: string, value: string) => {
    ids[key] = value;
    await saveIds({ ...ids });
  };

  const { imageHash, videoId, thumbnail } = await ensureMedia(
    graph,
    access,
    input,
    ids,
    keep,
    sleep,
  );

  const campaignId = await ensureCampaign(graph, access, input, ids, keep);

  let leadFormId: string | null = ids.leadForm ?? null;
  if (input.goal === 'lead_form' && !leadFormId) {
    leadFormId = await createLeadForm(pageGraph, access, input);
    await keep('leadForm', leadFormId);
  }

  let adSetId = ids.adSet ?? null;
  if (!adSetId) {
    const made = await createAdSet(
      graph,
      access,
      input,
      campaignId,
      ids.statusPlacement ?? access.details.statusPlacement,
    );
    adSetId = made.id;
    notes.push(...made.notes);
    ids.statusPlacement = made.statusPlacement;
    await keep('adSet', adSetId);
  }

  let creativeId = ids.creative ?? null;
  if (!creativeId) {
    creativeId = (
      await graph.post<{ id: string }>(`${access.adAccountId}/adcreatives`, {
        name: `${input.code} · Creative`,
        object_story_spec: objectStorySpec(
          access,
          input,
          { imageHash, videoId, thumbnail },
          leadFormId,
        ),
      })
    ).id;
    await keep('creative', creativeId);
  }

  const adName = `${input.code} · Ad`;
  let adId = ids.ad ?? null;
  if (!adId) {
    adId = (
      await graph.post<{ id: string }>(`${access.adAccountId}/ads`, {
        name: adName,
        adset_id: adSetId,
        creative: { creative_id: creativeId },
        status: 'PAUSED',
      })
    ).id;
    await keep('ad', adId);
  }

  // Every id is already stored: `keep` saves after each step.
  try {
    for (const id of [adId, adSetId, campaignId]) {
      await graph.post(id, { status: 'ACTIVE' });
    }
  } catch (error) {
    // Best effort: pause the campaign again so nothing spends while OneOhm shows "failed".
    await graph.post(campaignId, { status: 'PAUSED' }).catch(() => {});
    throw error;
  }
  return {
    externalId: campaignId,
    externalIds: { ...ids },
    ads: [{ externalId: adId, name: adName }],
    state: 'in_review',
    notes,
  };
}
