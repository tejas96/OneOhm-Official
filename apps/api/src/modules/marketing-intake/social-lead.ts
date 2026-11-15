import { type DatabaseExecutor, leads, waConversations } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import type { LeadIntakeService } from '../crm/lead-intake.service';
import type { Conversation } from '../whatsapp/chat-store';
import { channelOf, remember } from './social-chat';
import { type SocialContext, socialLeadInput } from './social-steps';

/**
 * The lead for a person who gave their number in the chat. The chat remembers it (so it is
 * made once) and moves to the lead's owner, who calls them.
 */
export async function makeSocialLead(
  tx: DatabaseExecutor,
  intake: Pick<LeadIntakeService, 'receive'>,
  chat: Conversation,
  context: SocialContext,
  message: string,
  phone: string,
  city: string,
): Promise<void> {
  const input = socialLeadInput(channelOf(chat), phone, message, chat, context.entry, city);
  const lead = await intake.receive(input, tx);
  await remember(tx, chat.id, { leadId: lead.leadId, askedNumber: true });
  const [owner] = await tx
    .select({ id: leads.ownerUserId })
    .from(leads)
    .where(eq(leads.id, lead.leadId));
  if (owner?.id)
    await tx
      .update(waConversations)
      .set({ assignedUserId: owner.id })
      .where(eq(waConversations.id, chat.id));
}
