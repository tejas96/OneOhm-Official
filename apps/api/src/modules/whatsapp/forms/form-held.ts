import type { DatabaseExecutor } from '@oneohm/database';
import { tellChatTeam } from '../chat-owner';
import type { Conversation } from '../chat-store';
import type { FormKey } from './form-registry';

/** What the person who holds the chat is told the form was ("Sent the problem form"). */
const WHAT: Record<FormKey, string> = {
  send_paper: 'a paper form',
  paid_another_way: 'the payment proof form',
  self_survey: 'the site survey form',
  report_problem: 'the problem report form',
  refer_friend: 'the refer-a-friend form',
  share_upi: 'the UPI ID form',
  onboarding: 'the onboarding form',
};

/**
 * A customer answered one of our forms while a person has the chat. The assistant files the answers
 * (the form is its own), so the person is told what came in; the same key as the "customer wrote"
 * alert keeps it to one alert per message.
 */
export async function tellHolder(
  db: DatabaseExecutor,
  chat: Conversation,
  waMessageId: string,
  formKey: FormKey,
): Promise<void> {
  if (chat.state !== 'human') return;
  await tellChatTeam(db, chat, {
    kind: 'whatsapp_message',
    title: `WhatsApp from ${chat.profileName ?? chat.phone}`,
    body: `Sent ${WHAT[formKey]}. The assistant filed it; please check.`,
    key: `wa_in:${waMessageId}`,
  });
}
