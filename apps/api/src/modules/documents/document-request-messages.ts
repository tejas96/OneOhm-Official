import {
  askForPaper,
  customerNotice,
  customers,
  type DatabaseExecutor,
  noticeCustomer,
  waConversations,
} from '@oneohm/database';
import { chatWindowOpen } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { queueReply } from '../whatsapp/chat-store';
import { homeNameOf, roundKey } from './document-request-home';

// What the customer hears about a paper the team asked for (papers per home, review A).

interface Asked {
  readonly id: string;
  readonly projectId: string | null;
  readonly projectCode: string | null;
  readonly title: string;
  readonly customer: string;
  readonly phone: string;
}

/**
 * Asks the customer for the paper (see askForPaper). Each "ask again" is a new round with
 * its own key, so it is sent again.
 */
export async function askCustomer(tx: DatabaseExecutor, asked: Asked, reasks: number) {
  await askForPaper(tx, asked, roundKey(`document_requested:${asked.id}`, reasks));
}

/**
 * The paper is no longer needed: an app inbox alert, and the same words in WhatsApp while
 * the customer's chat window is open (a template needs Meta's approval; this does not).
 */
export async function tellCancelled(
  tx: DatabaseExecutor,
  asked: Pick<Asked, 'id' | 'title' | 'phone'>,
  userId: string,
) {
  const payload = { document: asked.title };
  const key = `document_request_cancelled:${asked.id}`;
  await noticeCustomer(tx, asked.phone, 'document_request_cancelled', payload, key);
  const [chat] = await tx
    .select({
      id: waConversations.id,
      phone: waConversations.phone,
      at: waConversations.lastInboundAt,
      optedOutAt: waConversations.optedOutAt,
      language: customers.preferredLanguage,
    })
    .from(waConversations)
    .leftJoin(customers, eq(customers.phoneE164, waConversations.phone))
    .where(eq(waConversations.phone, asked.phone))
    .limit(1);
  if (!chat || chat.optedOutAt || !chatWindowOpen(chat.at)) return;
  const words = customerNotice('document_request_cancelled', payload, key, chat.language ?? '');
  if (!words) return;
  await queueReply(tx, chat, { kind: 'text', body: `${words.title}. ${words.body}` }, userId, key);
}

/** A paper given to the team (by hand, email, a site visit) closed the request: the app says so. */
export async function tellReceivedByTeam(
  tx: DatabaseExecutor,
  asked: Pick<Asked, 'id' | 'projectId' | 'title' | 'phone'>,
  reasks: number,
) {
  const home = await homeNameOf(tx, asked.projectId);
  await noticeCustomer(
    tx,
    asked.phone,
    'document_received_by_team',
    { document: asked.title, home },
    roundKey(`document_received_by_team:${asked.id}`, reasks),
  );
}
