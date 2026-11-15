/** One thing Meta's page or Instagram webhook told us, already sorted. */
export type MetaWebhookEvent =
  | {
      readonly kind: 'lead';
      /** Unique per event, for "already handled". */
      readonly key: string;
      readonly leadgenId: string;
      readonly pageId: string;
      readonly adId: string | null;
      readonly formId: string | null;
      readonly at: Date;
    }
  | {
      readonly kind: 'message';
      readonly key: string;
      readonly channel: 'instagram' | 'messenger';
      /** The person (Instagram-scoped or page-scoped id). */
      readonly senderId: string;
      readonly messageId: string;
      readonly text: string;
      /** Photos or files sent with it. */
      readonly attachments: number;
      readonly at: Date;
      /** Set when the chat was opened from an ad. */
      readonly adId: string | null;
      readonly adTitle: string | null;
    }
  | {
      readonly kind: 'comment';
      readonly key: string;
      readonly channel: 'instagram' | 'messenger';
      readonly senderId: string;
      readonly senderName: string | null;
      readonly commentId: string;
      readonly postId: string | null;
      readonly text: string;
      readonly at: Date;
    };

type Json = Record<string, unknown>;
type Own = { readonly pageId: string | null; readonly instagramId: string | null };

const obj = (value: unknown): Json | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
const list = (value: unknown): Json[] =>
  Array.isArray(value) ? value.map(obj).filter((v): v is Json => v !== null) : [];
const str = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : typeof value === 'number' ? String(value) : null;
const date = (value: unknown, unit: 'ms' | 's', fallback: Date): Date => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? new Date(unit === 's' ? n * 1000 : n) : fallback;
};

function messageEvent(
  m: Json,
  channel: 'instagram' | 'messenger',
  ownIds: (string | null)[],
  fallback: Date,
): MetaWebhookEvent | null {
  const senderId = str(obj(m.sender)?.id);
  if (!senderId || ownIds.includes(senderId)) return null;
  const message = obj(m.message);
  const postback = obj(m.postback);
  if (message?.is_echo) return null;
  const messageId = str(message?.mid) ?? str(postback?.mid);
  if (!messageId) return null;
  const referral = obj(m.referral) ?? obj(postback?.referral) ?? obj(message?.referral);
  return {
    kind: 'message',
    key: `meta:msg:${messageId}`,
    channel,
    senderId,
    messageId,
    text: str(message?.text) ?? str(postback?.title) ?? str(postback?.payload) ?? '',
    attachments: list(message?.attachments).length,
    at: date(m.timestamp, 'ms', fallback),
    adId: str(referral?.ad_id),
    adTitle: str(obj(referral?.ads_context_data)?.ad_title),
  };
}

function pageChange(change: Json, entryId: string | null, own: Own, at: Date) {
  const value = obj(change.value);
  if (!value) return null;
  if (change.field === 'leadgen') {
    const leadgenId = str(value.leadgen_id);
    if (!leadgenId) return null;
    return {
      kind: 'lead' as const,
      key: `meta:lead:${leadgenId}`,
      leadgenId,
      pageId: str(value.page_id) ?? entryId ?? own.pageId ?? '',
      adId: str(value.ad_id),
      formId: str(value.form_id),
      at: date(value.created_time, 's', at),
    };
  }
  if (change.field === 'feed' && value.item === 'comment' && value.verb === 'add') {
    const from = obj(value.from);
    const senderId = str(from?.id);
    const commentId = str(value.comment_id);
    if (!senderId || !commentId || senderId === own.pageId || senderId === entryId) return null;
    return {
      kind: 'comment' as const,
      key: `meta:comment:${commentId}`,
      channel: 'messenger' as const,
      senderId,
      senderName: str(from?.name),
      commentId,
      postId: str(value.post_id),
      text: str(value.message) ?? '',
      at: date(value.created_time, 's', at),
    };
  }
  return null;
}

function instagramComment(change: Json, entryId: string | null, own: Own, at: Date) {
  const value = obj(change.value);
  if (change.field !== 'comments' || !value) return null;
  const from = obj(value.from);
  const senderId = str(from?.id);
  const commentId = str(value.id);
  if (!senderId || !commentId || senderId === own.instagramId || senderId === entryId) return null;
  return {
    kind: 'comment' as const,
    key: `meta:comment:${commentId}`,
    channel: 'instagram' as const,
    senderId,
    senderName: str(from?.username),
    commentId,
    postId: str(obj(value.media)?.id),
    text: str(value.text) ?? '',
    at,
  };
}

function readEntry(entry: Json, isPage: boolean, own: Own): MetaWebhookEvent[] {
  const events: MetaWebhookEvent[] = [];
  const entryId = str(entry.id);
  const at = date(entry.time, 'ms', new Date());
  const mine = isPage ? own.pageId : own.instagramId;
  // Entries for other Pages or accounts are not ours.
  if (!mine || entryId !== mine) return events;
  const channel = isPage ? 'messenger' : 'instagram';
  const ownIds = isPage ? [own.pageId, entryId] : [own.instagramId, entryId];
  for (const m of list(entry.messaging)) {
    const event = messageEvent(m, channel, ownIds, at);
    if (event) events.push(event);
  }
  for (const change of list(entry.changes)) {
    const event = isPage
      ? pageChange(change, entryId, own, at)
      : instagramComment(change, entryId, own, at);
    if (event) events.push(event);
  }
  return events;
}

/** Our own page's and Instagram's posts are skipped. Odd input is skipped, never thrown. */
export function readMetaWebhook(body: unknown, own: Own): MetaWebhookEvent[] {
  const root = obj(body);
  if (!root || (root.object !== 'page' && root.object !== 'instagram')) return [];
  const events: MetaWebhookEvent[] = [];
  for (const entry of list(root.entry)) {
    try {
      events.push(...readEntry(entry, root.object === 'page', own));
    } catch {
      // Skip an entry that cannot be read.
    }
  }
  return events;
}
