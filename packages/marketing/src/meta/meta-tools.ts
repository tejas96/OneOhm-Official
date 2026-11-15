import type { MetaAccess, MetaAppConfig, MetaTools } from '../access';
import { PlatformError } from '../errors';
import { phoneDigits } from '../hashing';
import type { PlatformLead } from '../types';
import { type Graph, metaGraph } from './meta-graph';
import { type MetaOptions, realSleep, type Sleep } from './meta-sleep';

const IG_STEP_MS = 3_000;
const IG_WAIT_MS = 60_000;

const REPLY_CLOSED =
  'Instagram or Facebook no longer lets us reply here: the person wrote over 24 hours ago, or this comment already got its one private reply.';

const detailOf = (error: unknown) => (error instanceof PlatformError ? error.detail : null);

/** Code 10 (outside the reply window), 551 (person unavailable) and the 2018108 "already replied" cousins. */
function isReplyWindowClosed(error: unknown): boolean {
  if (!(error instanceof PlatformError)) return false;
  const detail = error.detail ?? '';
  return /\bcode (10|551)\b|subcode (2018108|2534022|2018278)\b/.test(detail);
}

async function waitForInstagram(graph: Graph, creationId: string, sleep: Sleep): Promise<void> {
  for (let waited = 0; waited <= IG_WAIT_MS; waited += IG_STEP_MS) {
    const reply = await graph.get<{ status_code?: string }>(creationId, {
      fields: 'status_code',
    });
    if (reply.status_code === 'FINISHED') return;
    if (reply.status_code === 'ERROR' || reply.status_code === 'EXPIRED') {
      throw new PlatformError('invalid', 'Instagram could not read the file. Try another one.');
    }
    await sleep(IG_STEP_MS);
  }
  throw new PlatformError(
    'temporary',
    'Instagram is still getting the post ready. Try again in a minute.',
  );
}

/** "+91 98765 43210" and "9876543210" both become +919876543210. */
function e164(raw: string | undefined): string | null {
  const digits = phoneDigits(raw ?? '');
  return digits ? `+${digits}` : null;
}

interface LeadReply {
  id: string;
  created_time?: string;
  field_data?: { name: string; values?: string[] }[];
  ad_id?: string;
  form_id?: string;
  campaign_id?: string;
  platform?: string;
}

function readLeadFields(reply: LeadReply): PlatformLead {
  const fields = new Map((reply.field_data ?? []).map((f) => [f.name, f.values?.[0]]));
  const pick = (...names: string[]) => names.map((n) => fields.get(n)).find(Boolean) ?? null;
  const values = [...fields.values()].filter((v): v is string => typeof v === 'string');
  return {
    platformLeadId: reply.id,
    name: pick('full_name', 'name'),
    phone: e164(pick('phone_number', 'phone') ?? undefined),
    email: pick('email'),
    city: pick('city'),
    adId: reply.ad_id ?? null,
    campaignExternalId: reply.campaign_id ?? null,
    formId: reply.form_id ?? null,
    platform: reply.platform === 'ig' ? 'instagram' : 'facebook',
    gclid: null,
    createdAt: reply.created_time ? new Date(reply.created_time) : new Date(),
    isTest: values.some((v) => v.toLowerCase().startsWith('<test lead')),
  };
}

export function createMetaTools(
  access: MetaAccess,
  app: MetaAppConfig,
  options: MetaOptions = {},
): MetaTools {
  const sleep = options.sleep ?? realSleep;
  const pageId = access.details.pageId;
  const igId = access.details.instagramId;
  const page = (): Graph => {
    if (!access.pageToken || !pageId) {
      throw new PlatformError('invalid', 'Connect a Facebook Page to Meta first.');
    }
    return metaGraph(app, access.pageToken);
  };

  return {
    async publishPost(input) {
      const graph = page();
      const video = input.media.kind === 'video';
      if (input.channel === 'facebook') {
        const reply = video
          ? await graph.post<{ id: string; post_id?: string }>(`${pageId}/videos`, {
              file_url: input.media.publicUrl,
              description: input.text,
            })
          : await graph.post<{ id: string; post_id?: string }>(`${pageId}/photos`, {
              url: input.media.publicUrl,
              message: input.text,
            });
        const postId = reply.post_id ?? reply.id;
        return { postId, permalink: `https://www.facebook.com/${postId}` };
      }
      if (!igId) {
        throw new PlatformError('invalid', 'This Page has no Instagram account linked in Meta.');
      }
      const created = await graph.post<{ id: string }>(`${igId}/media`, {
        ...(video
          ? { media_type: 'REELS', video_url: input.media.publicUrl }
          : { image_url: input.media.publicUrl }),
        caption: input.text,
      });
      await waitForInstagram(graph, created.id, sleep);
      const published = await graph.post<{ id: string }>(`${igId}/media_publish`, {
        creation_id: created.id,
      });
      const permalink = await graph
        .get<{ permalink?: string }>(published.id, { fields: 'permalink' })
        .then((r) => r.permalink ?? null)
        .catch(() => null);
      return { postId: published.id, permalink };
    },

    async sendMessage(message) {
      const recipient = message.commentId
        ? { comment_id: message.commentId }
        : message.recipientId
          ? { id: message.recipientId }
          : null;
      if (!recipient) throw new PlatformError('invalid', 'There is nobody to send this to.');
      try {
        const reply = await page().post<{ message_id?: string }>(`${pageId}/messages`, {
          recipient,
          messaging_type: 'RESPONSE',
          message: { text: message.text },
        });
        return { messageId: reply.message_id ?? '' };
      } catch (error) {
        if (isReplyWindowClosed(error))
          throw new PlatformError('invalid', REPLY_CLOSED, detailOf(error));
        throw error;
      }
    },

    async readLead(leadgenId) {
      const reply = await page().get<LeadReply>(leadgenId, {
        fields: 'created_time,field_data,ad_id,form_id,campaign_id,platform,is_organic',
      });
      return readLeadFields({ ...reply, id: reply.id ?? leadgenId });
    },

    async profileName(channel, userId) {
      try {
        const graph = page();
        if (channel === 'messenger') {
          const reply = await graph.get<{ name?: string }>(userId, { fields: 'name' });
          return reply.name ?? null;
        }
        const reply = await graph.get<{ username?: string; name?: string }>(userId, {
          fields: 'username,name',
        });
        return reply.username ? `@${reply.username}` : (reply.name ?? null);
      } catch {
        return null;
      }
    },
  };
}
