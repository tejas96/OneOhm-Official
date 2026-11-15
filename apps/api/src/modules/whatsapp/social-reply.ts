import { randomUUID } from 'node:crypto';
import { type DatabaseExecutor, outbox, waConversations, waMessages } from '@oneohm/database';
import { eq, sql } from 'drizzle-orm';

export type SocialChannel = 'instagram' | 'messenger';

/** Words for each social channel, as people read them. */
export const SOCIAL_NAME: Readonly<Record<SocialChannel, string>> = {
  instagram: 'Instagram',
  messenger: 'Facebook',
};

export const isSocialChannel = (channel: string): channel is SocialChannel =>
  channel === 'instagram' || channel === 'messenger';

/** The chat key of a person on Instagram (`ig:<id>`) or Facebook (`fb:<id>`). */
export const socialPhone = (channel: SocialChannel, id: string) =>
  `${channel === 'instagram' ? 'ig' : 'fb'}:${id}`;

/** The channel and person id inside a chat key; null for a WhatsApp number. */
export function socialHandle(phone: string): { channel: SocialChannel; id: string } | null {
  const match = /^(ig|fb):(.+)$/.exec(phone);
  if (!match?.[2]) return null;
  return { channel: match[1] === 'ig' ? 'instagram' : 'messenger', id: match[2] };
}

/** Where a social reply goes: a message to the person, or a private reply to their comment. */
export interface SocialTarget {
  readonly recipientId: string | null;
  readonly commentId: string | null;
}

/** Instagram and Facebook let us message a person only for 24 hours after their last message. */
export const DM_WINDOW_MS = 24 * 3_600_000;
/** A comment can be answered once, privately, for 7 days. */
export const COMMENT_WINDOW_MS = 7 * 24 * 3_600_000;
const KEPT_COMMENTS = 20;

/** What a social chat remembers about how the person reached us. */
export interface SocialWindows {
  readonly messaged?: boolean;
  /** When the person last sent us a message (ISO time). */
  readonly lastDmAt?: string;
  readonly lastCommentId?: string;
  /** Their newest comments, newest last. */
  readonly comments?: readonly { readonly id: string; readonly at: string }[];
  /** Comments that already got their one private reply (the newest ones). */
  readonly repliedComments?: readonly string[];
}

/** The comment list with a new comment added (newest last, only the newest ones kept). */
export function withComment(context: SocialWindows, id: string, at: Date) {
  const rest = (context.comments ?? []).filter((c) => c.id !== id);
  return [...rest, { id, at: at.toISOString() }]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-KEPT_COMMENTS);
}

/** The later of the saved last-message time and this one, as an ISO time. */
export function laterDm(context: SocialWindows, at: Date): string {
  const saved = context.lastDmAt && new Date(context.lastDmAt);
  return saved && saved > at ? saved.toISOString() : at.toISOString();
}

/**
 * Where a staff reply goes: a message to the person when they wrote to us in the last 24
 * hours; else a private reply to their newest comment of the last 7 days that has none yet;
 * else null (nothing can be sent). A chat saved before these were kept falls back on its
 * last inbound time.
 */
export function chooseSocialTarget(
  context: SocialWindows,
  handleId: string | null,
  lastInboundAt: string | null,
  now: Date = new Date(),
): SocialTarget | null {
  const dm = context.lastDmAt ?? (context.messaged ? lastInboundAt : null);
  if (handleId && dm && now.getTime() - new Date(dm).getTime() <= DM_WINDOW_MS)
    return { recipientId: handleId, commentId: null };
  const replied = new Set(context.repliedComments ?? []);
  const known = context.comments?.length
    ? [...context.comments]
    : context.lastCommentId && lastInboundAt
      ? [{ id: context.lastCommentId, at: lastInboundAt }]
      : [];
  const comment = known
    .filter(
      (c) => !replied.has(c.id) && now.getTime() - new Date(c.at).getTime() <= COMMENT_WINDOW_MS,
    )
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  return comment ? { recipientId: null, commentId: comment.id } : null;
}

/** Notes on the chat that a comment has had its one private reply (the newest ones are kept). */
async function markCommentReplied(
  db: DatabaseExecutor,
  chatId: string,
  commentId: string,
): Promise<void> {
  const [row] = await db
    .select({ context: waConversations.context })
    .from(waConversations)
    .where(eq(waConversations.id, chatId))
    .for('update');
  const context = (row?.context ?? {}) as SocialWindows;
  const replied = [...new Set([...(context.repliedComments ?? []), commentId])].slice(
    -KEPT_COMMENTS,
  );
  await db
    .update(waConversations)
    .set({
      context: sql`coalesce(${waConversations.context}, '{}'::jsonb) || ${JSON.stringify({ repliedComments: replied })}::jsonb`,
    })
    .where(eq(waConversations.id, chatId));
}

/**
 * Queues a reply on Instagram or Facebook for the worker (it sends through Meta) and keeps
 * it in the chat history. With a `dedupeKey` the same reply is queued once. A private reply
 * to a comment is noted on the chat, since a comment gets only one.
 */
export async function queueSocialReply(
  db: DatabaseExecutor,
  chat: { readonly id: string; readonly phone: string; readonly channel: string },
  body: string,
  target: SocialTarget,
  sentByUserId: string | null = null,
  dedupeKey?: string,
): Promise<void> {
  if (!isSocialChannel(chat.channel)) throw new Error('Not an Instagram or Facebook chat.');
  const [row] = await db
    .insert(outbox)
    .values({
      channel: chat.channel,
      recipient: chat.phone,
      template: 'session:text',
      payload: { kind: 'text', body, ...target },
      dedupeKey: dedupeKey ?? `chat:${randomUUID()}`,
      createdAt: sql`clock_timestamp()`,
    })
    .onConflictDoNothing()
    .returning({ id: outbox.id, createdAt: outbox.createdAt });
  if (!row && dedupeKey) return;
  if (target.commentId) await markCommentReplied(db, chat.id, target.commentId);
  await db.insert(waMessages).values({
    conversationId: chat.id,
    direction: 'out',
    kind: 'text',
    body,
    outboxId: row?.id ?? null,
    sentByUserId,
    ...(row && { createdAt: row.createdAt }),
  });
}
