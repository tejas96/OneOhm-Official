import {
  answererFor,
  chatsWaitingSince,
  type Database,
  notify,
  notifyStaffHolders,
  waConversations,
} from '@oneohm/database';
import { chatWaitStage } from '@oneohm/domain';
import { eq } from 'drizzle-orm';

/**
 * Chats a person took over where the customer wrote last and nobody has answered. Each
 * stage alerts once per customer message, so a reply resets it and nothing repeats.
 */
export async function queueChatReminders(db: Database, now: Date, timeZone: string) {
  const open = await db
    .select({
      id: waConversations.id,
      phone: waConversations.phone,
      name: waConversations.profileName,
      assignedUserId: waConversations.assignedUserId,
      handledByUserId: waConversations.handledByUserId,
      customerId: waConversations.customerId,
    })
    .from(waConversations)
    .where(eq(waConversations.state, 'human'));
  if (open.length === 0) return 0;
  // Waiting since the customer's first message after a person last answered.
  const waiting = await chatsWaitingSince(
    db,
    open.map((chat) => chat.id),
  );
  let sent = 0;
  for (const chat of open) {
    const since = waiting.get(chat.id);
    if (!since) continue;
    const stage = chatWaitStage(since, now, timeZone);
    if (!stage) continue;
    // One alert per stage for each wait (a person's answer starts a new one).
    const wait = `${chat.id}:${since.getTime()}`;
    const who = chat.name ?? chat.phone;
    const subject = { type: 'chat' as const, id: chat.id };
    // Whoever covers today: an owner on leave hands to their backup.
    const covering = await Promise.all(
      [chat.handledByUserId, chat.assignedUserId].map((id) => answererFor(db, id)),
    );
    const people = [...new Set(covering)].filter((id): id is string => Boolean(id));
    for (const userId of people)
      await notify(
        db,
        { userId },
        {
          kind: 'whatsapp_waiting',
          title: `${who} is waiting for your reply`,
          body: 'They wrote on WhatsApp and have no answer yet.',
          subject,
          dedupeKey: `wa_wait:${wait}:1:${userId}`,
        },
      );
    // Late, or nobody owns it: the service desk steps in.
    if (stage === 2 || people.length === 0)
      await notifyStaffHolders(db, chat.customerId ? 'service.manage' : 'leads.manage', {
        kind: 'whatsapp_waiting',
        title: `${who} has no WhatsApp reply`,
        body: `Waiting ${stage === 2 ? 'over 2 hours' : 'over 30 minutes'}. Open the chat to answer.`,
        subject,
        dedupeKey: `wa_wait:${wait}:desk:${stage}`,
      });
    sent += 1;
  }
  return sent;
}
