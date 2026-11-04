import { customers, type DatabaseExecutor, leads, tellChatTeam } from '@oneohm/database';
import { type CallbackSlot, callbackWhen, slotReplacesFollowUp } from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { and, desc, eq, notInArray, or } from 'drizzle-orm';
import { logLead } from '../crm/lead-history';
import { ensureChatOwner } from '../whatsapp/chat-owner';
import type { Conversation } from '../whatsapp/chat-store';

/** The business clock as "HH:MM". */
function clockIn(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
}

/**
 * The customer picked a time for the call (redesign §14): the lead they have (open) gets that
 * time as its next action when it has none or a later one (else it is logged), and the chat's person (the project manager, else the lead owner,
 * else the desk) is told with the time. Customers with no lead have no follow-up list, so the
 * alert is the follow-up. Returns the day and time set.
 */
export async function createCallbackFollowUp(
  tx: DatabaseExecutor,
  chat: Conversation,
  customerId: string,
  slot: CallbackSlot,
  actionId: string,
  timeZone: string,
  now = new Date(),
): Promise<{ on: string; time: string }> {
  const when = callbackWhen(slot, clockIn(timeZone, now));
  const today = todayIn(timeZone, now);
  const on = when.nextDay ? addDays(today, 1) : today;
  const note = `Call back in the ${slot} (asked on WhatsApp)`;
  const [customer] = await tx
    .select({ name: customers.name, phone: customers.phoneE164 })
    .from(customers)
    .where(eq(customers.id, customerId));
  const [lead] = await tx
    .select({ id: leads.id, on: leads.nextActionOn, time: leads.nextActionTime })
    .from(leads)
    .where(
      and(
        notInArray(leads.stage, ['won', 'lost']),
        or(eq(leads.customerId, customerId), eq(leads.phoneE164, customer?.phone ?? chat.phone)),
      ),
    )
    .orderBy(desc(leads.createdAt))
    .limit(1);
  if (lead) {
    // The lead's own next action is never overwritten by a sooner-or-equal plan of the team:
    // it is set only when empty or later than the slot, otherwise the ask is logged beside it.
    const replace = slotReplacesFollowUp(
      lead,
      { on, time: when.time },
      { on: today, time: clockIn(timeZone, now) },
    );
    if (replace)
      await tx
        .update(leads)
        .set({ nextActionOn: on, nextActionTime: when.time, nextActionNote: note, updatedAt: now })
        .where(eq(leads.id, lead.id));
    await logLead(
      tx,
      lead.id,
      null,
      'follow_up',
      replace
        ? `${note}: ${on} ${when.time}`
        : `${note}: ${on} ${when.time}. The follow-up planned for ${lead.on} stays.`,
    );
  }
  const owned = await ensureChatOwner(tx, chat);
  await tellChatTeam(tx, owned, {
    kind: 'callback_asked',
    title: `Call ${customer?.name ?? 'the customer'} back in the ${slot}`,
    body: `${customer?.name ?? 'The customer'} asked for a call on ${on} at about ${when.time} (WhatsApp).`,
    key: `callback:${actionId}`,
  });
  return { on, time: when.time };
}
