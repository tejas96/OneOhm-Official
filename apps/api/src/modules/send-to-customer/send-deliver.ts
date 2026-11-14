import type { SendPreview } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  type MessageFallback,
  messageTemplates,
  noticeCustomer,
  queueCustomerMessageAs,
  type Routed,
  wasQueued,
  withFallback,
} from '@oneohm/database';
import {
  DEFAULT_MESSAGE_TEMPLATES,
  renderTemplate,
  SEND_TEMPLATE_WORDS,
  templateIsOn,
} from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { chatReplySummary } from '../whatsapp/chat-reply';
import { conversationForPhone, queueReply } from '../whatsapp/chat-store';
import type { SendContext } from './send-context';
import type { Built } from './send-messages';

/** Whether the template the customer would get outside the chat window is switched on (the worker's rule). */
export async function templateOn(db: DatabaseExecutor, key: string): Promise<boolean> {
  const [row] = await db
    .select({ active: messageTemplates.active })
    .from(messageTemplates)
    .where(eq(messageTemplates.key, key))
    .limit(1);
  return templateIsOn(key, row);
}

/** What the customer would get now: the chat message, or the template when the chat is closed. */
export async function previewOf(
  db: DatabaseExecutor,
  ctx: SendContext,
  built: Built,
): Promise<SendPreview> {
  if (ctx.chatOpen) {
    const buttons = built.replies.flatMap((reply) =>
      reply.kind === 'buttons'
        ? reply.buttons.map((button) => button.title)
        : reply.kind === 'location_request'
          ? ['📍 Send location']
          : [],
    );
    // The buttons are shown apart, so the words alone are the body.
    const body = built.replies
      .map((reply) =>
        reply.kind === 'buttons' || reply.kind === 'location_request'
          ? reply.body
          : chatReplySummary(reply),
      )
      .join('\n\n');
    return { body, buttons, via: 'chat', language: ctx.language, note: null };
  }
  const template = DEFAULT_MESSAGE_TEMPLATES.find((item) => item.key === built.template.key);
  const on = await templateOn(db, built.template.key);
  // The wording the customer will read, in their language, and the titles of its quick replies.
  const local = SEND_TEMPLATE_WORDS[built.template.key];
  const preview =
    template && ctx.language !== 'en' && local ? local[ctx.language] : template?.preview;
  return {
    body: template
      ? renderTemplate(preview ?? template.preview, template.fields, built.template.payload)
      : built.template.key,
    buttons: [...(local?.buttons[ctx.language] ?? [])],
    via: 'template',
    language: ctx.language,
    note: on
      ? 'The chat is closed, so the customer gets this approved message.'
      : 'The chat is closed and this message is not switched on yet (Settings → WhatsApp messages), so the customer sees it in the app only.',
  };
}

/** How a send went: the way it travelled, and what routing did when it went as the template. */
export interface Delivered {
  readonly via: 'chat' | 'template';
  readonly routed: Routed | 'chat';
}

/**
 * Sends it: the chat messages inside the 24-hour window (and the same news in the app inbox),
 * else the approved template, which also reaches an SMS or in-person customer by the usual
 * route. `key` makes the same send once. `fallback` rides on the first chat message: if the
 * window turns out to be closed when it is sent, the worker queues that template instead.
 */
export async function deliverRouted(
  tx: DatabaseExecutor,
  ctx: SendContext,
  built: Built,
  key: string,
  userId: string | null,
  fallback?: MessageFallback,
): Promise<Delivered> {
  if (!ctx.chatOpen) {
    const routed = await queueCustomerMessageAs(
      tx,
      ctx.phone,
      built.template.key,
      built.template.payload,
      key,
    );
    return { via: 'template', routed };
  }
  const chat = await conversationForPhone(tx, ctx.phone);
  for (const [index, reply] of built.replies.entries()) {
    const carried =
      fallback && index === 0
        ? withFallback(reply, fallback.template, fallback.payload, fallback.dedupeKey)
        : reply;
    await queueReply(tx, chat, carried, userId, index === 0 ? key : `${key}:${index}`);
  }
  await noticeCustomer(tx, ctx.phone, built.template.key, built.template.payload, key);
  return { via: 'chat', routed: 'chat' };
}

/**
 * Whether the customer will hear it: the chat message went, or the template was newly queued (or
 * handed to the team) and is switched on. Nothing routed, a duplicate or a switched-off template: no.
 */
export async function wasDelivered(
  tx: DatabaseExecutor,
  built: Built,
  sent: Delivered,
): Promise<boolean> {
  if (sent.via === 'chat') return true;
  return (
    sent.routed !== 'chat' && wasQueued(sent.routed) && (await templateOn(tx, built.template.key))
  );
}

/** `deliverRouted`, saying only the way it travelled. */
export async function deliver(
  tx: DatabaseExecutor,
  ctx: SendContext,
  built: Built,
  key: string,
  userId: string | null,
): Promise<'chat' | 'template'> {
  return (await deliverRouted(tx, ctx, built, key, userId)).via;
}
