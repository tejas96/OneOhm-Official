import {
  askForPaper,
  type DatabaseExecutor,
  homeNameOf,
  noticeCustomer,
  paperRequestTemplate,
  roundKey,
  SOME_HOME,
} from '@oneohm/database';
import { mayChat } from '../journey/auto-messages';
import { CHAT_WORDS } from '../whatsapp/assistant/chat-words';
import { inLanguage } from '../whatsapp/assistant/language';
import { queueReply } from '../whatsapp/chat-store';
import { type Asked, openChat } from './document-request-messages';

export { tellCancelled } from './document-request-messages';

/**
 * Asks the customer for the paper. While their chat window is open (and the message is on, the
 * rule `mayChat` shares with the worker) it is a chat message with [Send it now], which opens the
 * send-a-paper form; the app inbox says the same. Otherwise the approved template goes (see
 * askForPaper). Each "ask again" is a new round with its own key, so it is sent again.
 */
export async function askCustomer(
  tx: DatabaseExecutor,
  asked: Asked,
  reasks: number,
  userId: string | null = null,
) {
  const key = roundKey(`document_requested:${asked.id}`, reasks);
  const template = await paperRequestTemplate(tx);
  if (!(await mayChat(tx, asked.phone, template))) {
    await askForPaper(tx, asked, key, template);
    return;
  }
  const chat = await openChat(tx, asked.phone);
  if (!chat) return void (await askForPaper(tx, asked, key, template));
  const home = await homeNameOf(tx, asked.projectId, asked.propertyId ?? null);
  await noticeCustomer(
    tx,
    asked.phone,
    template,
    { customer: asked.customer, document: asked.title, project: asked.projectCode ?? home, home },
    key,
  );
  const reply = await inLanguage(chat.language, async () => ({
    kind: 'buttons' as const,
    body: CHAT_WORDS.paper.ask(asked.title, home === SOME_HOME ? null : home),
    buttons: [{ id: `sendit:${asked.id}`, title: CHAT_WORDS.buttons.sendItNow }],
  }));
  await queueReply(tx, chat, reply, userId, key);
}
