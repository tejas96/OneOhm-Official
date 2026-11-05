import {
  askForPaper,
  customerNotice,
  customers,
  type DatabaseExecutor,
  homeNameOf,
  noticeCustomer,
  roundKey,
  waConversations,
} from '@oneohm/database';
import { chatWindowOpen } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { chatLanguage } from '../whatsapp/assistant/chat-language';
import { CHAT_WORDS } from '../whatsapp/assistant/chat-words';
import {
  type AssistantLanguage,
  assistantLanguage,
  inLanguage,
} from '../whatsapp/assistant/language';
import type { ChatReply } from '../whatsapp/chat-reply';
import { queueReply } from '../whatsapp/chat-store';

// What the customer hears about a paper the team asked for (papers per home, review A).

export interface Asked {
  readonly id: string;
  readonly projectId: string | null;
  readonly projectCode: string | null;
  /** The home of a paper asked on a lead, which has no project yet. */
  readonly propertyId?: string | null;
  readonly title: string;
  readonly customer: string;
  readonly phone: string;
}

/** The customer's open WhatsApp chat (the 24-hour window) and the language it speaks, else null. */
export async function openChat(tx: DatabaseExecutor, phone: string) {
  const [chat] = await tx
    .select({
      id: waConversations.id,
      phone: waConversations.phone,
      at: waConversations.lastInboundAt,
      optedOutAt: waConversations.optedOutAt,
      customerId: waConversations.customerId,
      chatLanguage: waConversations.language,
    })
    .from(waConversations)
    .where(eq(waConversations.phone, phone))
    .limit(1);
  if (!chat || chat.optedOutAt || !chatWindowOpen(chat.at)) return null;
  const language = await chatLanguage(tx, {
    customerId: chat.customerId,
    language: chat.chatLanguage,
    phone,
  });
  return { id: chat.id, phone, language };
}

/**
 * The language to write to this number in: the chat's own (the same helper the assistant
 * uses), else the customer's saved one. Every word of one message follows it.
 */
export async function languageOfPhone(
  tx: DatabaseExecutor,
  phone: string,
): Promise<AssistantLanguage> {
  const [chat] = await tx
    .select({
      customerId: waConversations.customerId,
      language: waConversations.language,
    })
    .from(waConversations)
    .where(eq(waConversations.phone, phone))
    .limit(1);
  if (chat) return chatLanguage(tx, { ...chat, phone });
  const [owner] = await tx
    .select({ language: customers.preferredLanguage })
    .from(customers)
    .where(eq(customers.phoneE164, phone))
    .limit(1);
  return assistantLanguage(owner?.language);
}

/**
 * The same news in the customer's chat while the window is open (a template needs Meta's
 * approval; this does not): their words, in their language, with the app's title and body.
 */
async function tellInChat(
  tx: DatabaseExecutor,
  asked: { readonly phone: string },
  template: string,
  payload: Readonly<Record<string, string>>,
  key: string,
  options: {
    readonly userId: string | null;
    /** What sits between the title and the body; null says the title alone. */
    readonly join: string | null;
    readonly tapPaper?: string;
  },
) {
  const chat = await openChat(tx, asked.phone);
  if (!chat) return false;
  const words = customerNotice(template, payload, key, `${chat.language}-IN`);
  if (!words) return false;
  const body = options.join === null ? words.title : `${words.title}${options.join}${words.body}`;
  const reply: ChatReply = options.tapPaper
    ? {
        kind: 'buttons',
        body,
        buttons: [
          {
            id: `sendit:${options.tapPaper}`,
            title: await inLanguage(chat.language, async () => CHAT_WORDS.buttons.sendItNow),
          },
        ],
      }
    : { kind: 'text', body };
  await queueReply(tx, chat, reply, options.userId, key);
  return true;
}

/**
 * The paper is no longer needed: an app inbox alert, and the same words in WhatsApp while
 * the customer's chat window is open.
 */
export async function tellCancelled(
  tx: DatabaseExecutor,
  asked: Pick<Asked, 'id' | 'title' | 'phone'>,
  userId: string,
) {
  const payload = { document: asked.title };
  const key = `document_request_cancelled:${asked.id}`;
  await noticeCustomer(tx, asked.phone, 'document_request_cancelled', payload, key);
  await tellInChat(tx, asked, 'document_request_cancelled', payload, key, { userId, join: '. ' });
}

/** The reason as the end of a sentence: one full stop, never two. */
const sentence = (reason: string) =>
  /[.!?।]$/.test(reason.trim()) ? reason.trim() : `${reason.trim()}.`;

/**
 * "Not right, ask again": "Please send your {paper} again: {reason}." In an open chat it
 * is words with [Send it now] (the app inbox says it too); outside the window the approved
 * request template goes, with the reason in the app. Each round has its own key.
 */
export async function tellAskedAgain(
  tx: DatabaseExecutor,
  asked: Asked,
  reason: string,
  reasks: number,
  userId: string | null,
) {
  const key = roundKey(`document_requested:${asked.id}`, reasks);
  const open = await openChat(tx, asked.phone);
  if (!open) {
    await askForPaper(tx, { ...asked, reason }, key);
    return;
  }
  const home = await homeNameOf(tx, asked.projectId, asked.propertyId ?? null);
  const payload = { document: asked.title, reason, home };
  await noticeCustomer(tx, asked.phone, 'paper_request', payload, key);
  await tellInChat(tx, asked, 'paper_request', { ...payload, reason: sentence(reason) }, key, {
    userId,
    join: ': ',
    tapPaper: asked.id,
  });
}

/** The team checked the paper: "Your {paper} is checked ✅" in the app, and in an open chat. */
export async function tellChecked(
  tx: DatabaseExecutor,
  asked: Pick<Asked, 'id' | 'title' | 'phone'>,
  reasks: number,
  userId: string,
) {
  const key = roundKey(`paper_checked:${asked.id}`, reasks);
  await noticeCustomer(tx, asked.phone, 'paper_checked', { document: asked.title }, key);
  // In the chat the paper's name is bold.
  await tellInChat(tx, asked, 'paper_checked', { document: `*${asked.title}*` }, key, {
    userId,
    join: null,
  });
}

/** A paper given to the team (by hand, email, a site visit) closed the request: the app says so. */
export async function tellReceivedByTeam(
  tx: DatabaseExecutor,
  asked: Pick<Asked, 'id' | 'projectId' | 'propertyId' | 'title' | 'phone'>,
  reasks: number,
) {
  const home = await homeNameOf(tx, asked.projectId, asked.propertyId ?? null);
  await noticeCustomer(
    tx,
    asked.phone,
    'document_received_by_team',
    { document: asked.title, home },
    roundKey(`document_received_by_team:${asked.id}`, reasks),
  );
}

/**
 * The paper we hold is too old: "We need your latest electricity bill for {home} — the one
 * we have is from {month}." In the app inbox and, while the chat is open, in the chat with
 * [Send it now]; outside the window the plain ask template goes (the inbox has the reason).
 */
export async function tellStalePaper(
  tx: DatabaseExecutor,
  asked: Asked,
  old: { readonly document: string; readonly month: string },
): Promise<void> {
  const key = `paper_stale:${asked.id}`;
  const home = await homeNameOf(tx, asked.projectId, asked.propertyId ?? null);
  const payload = { document: old.document, home, month: old.month };
  await noticeCustomer(tx, asked.phone, 'paper_stale', payload, key);
  const told = await tellInChat(tx, asked, 'paper_stale', payload, key, {
    userId: null,
    join: '. ',
    tapPaper: asked.id,
  });
  if (!told) await askForPaper(tx, asked, key);
}
