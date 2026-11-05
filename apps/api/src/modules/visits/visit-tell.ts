import type { DatabaseExecutor } from '@oneohm/database';
import { noticeCustomer } from '@oneohm/database';
import { languageOfPhone } from '../documents/document-request-messages';
import { chatOpenFor, type SendContext } from '../send-to-customer/send-context';
import { deliver } from '../send-to-customer/send-deliver';
import type { Built } from '../send-to-customer/send-messages';
import { inLanguage } from '../whatsapp/assistant/language';
import { conversationForPhone, queueReply } from '../whatsapp/chat-store';
import type { VisitTarget } from './visit-reads';
import { VISIT_WORDS, workWords } from './visit-words';

/** Who a visit message goes to: the customer's number, language and whether the chat is open. */
export async function visitContext(
  db: DatabaseExecutor,
  target: Pick<
    VisitTarget,
    'customerId' | 'customerName' | 'phone' | 'projectId' | 'leadId' | 'taskId' | 'serviceRequestId'
  >,
): Promise<SendContext> {
  return {
    customerId: target.customerId,
    customerName: target.customerName,
    phone: target.phone,
    language: await languageOfPhone(db, target.phone),
    projectId: target.projectId,
    projectCode: null,
    leadId: target.leadId,
    taskId: target.taskId,
    serviceRequestId: target.serviceRequestId,
    place: { customer: true, project: false, lead: false, task: false },
    chatOpen: await chatOpenFor(db, target.phone),
  };
}

/**
 * Tells the customer in their language: the chat message inside the 24-hour window, else the
 * approved template (whose quick reply opens the chat step). One key, one message.
 */
export async function tellVisit(
  tx: DatabaseExecutor,
  ctx: SendContext,
  build: () => Built,
  key: string,
  userId: string | null,
): Promise<'chat' | 'template'> {
  const built = await inLanguage(ctx.language, async () => build());
  return deliver(tx, ctx, built, key, userId);
}

/** The cancel notice: in the chat while it is open, and always in the app inbox. */
export async function tellCancelled(
  tx: DatabaseExecutor,
  ctx: SendContext,
  given: { kind: Parameters<typeof workWords>[0]; home: string },
  key: string,
): Promise<void> {
  const body = await inLanguage(ctx.language, async () =>
    VISIT_WORDS.cancelled(workWords(given.kind), given.home),
  );
  if (ctx.chatOpen) {
    const chat = await conversationForPhone(tx, ctx.phone);
    await queueReply(tx, chat, { kind: 'text', body }, null, key);
  }
  await noticeCustomer(tx, ctx.phone, 'visit_cancelled', { home: given.home, body }, key);
}
