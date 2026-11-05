import type { Transaction } from '@oneohm/database';
import { callDay, freeSlots, isWorkingDay, type VisitSlot } from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { updateLeadFromChat } from '../../crm/lead-from-chat';
import { freeDaysFor, takenSlots } from '../../visits/visit-capacity';
import { dayWords } from '../../visits/visit-messages';
import { VISIT_WORDS } from '../../visits/visit-words';
import { answererName, ensureChatOwner, tellChatTeam } from '../chat-owner';
import { type Conversation, queueReply } from '../chat-store';
import { ONBOARD_WORDS } from './onboard-words';
import { MORE_WORDS } from './onboard-words-more';
import { ESTIMATE_CHOICES, PERSON_CHOICE } from './onboarding-context';

/**
 * [Book a visit] under the estimate (redesign §16): a new contact has no customer record yet, so the free
 * site visit is picked by taps here (the same free days and Morning/Afternoon as a customer's pick) and
 * lands on the LEAD: its next action is that day, a history note says what was picked, and the lead's owner
 * confirms by call. Nothing is reserved until the owner books it (Visit card on the lead).
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const talk = { id: PERSON_CHOICE, title: ONBOARD_WORDS.talkToPerson };

interface Lead {
  readonly id: string;
  readonly ownerUserId: string | null;
}

/** The free days as a list, with a person always one tap away. */
export async function askVisitDay(
  tx: Transaction,
  chat: Conversation,
  lead: Lead,
  zone: string,
): Promise<void> {
  const owned = await ensureChatOwner(tx, chat);
  const name = await answererName(tx, owned);
  const days = await freeDaysFor(
    tx,
    lead.ownerUserId ? [lead.ownerUserId] : [],
    9,
    undefined,
    zone,
  );
  if (days.length === 0) {
    await tellChatTeam(tx, owned, {
      kind: 'whatsapp_callback',
      title: 'No free day to offer a site visit',
      body: `${chat.profileName ?? 'A customer'} · ${chat.phone}. Please call them to fix the visit.`,
      key: `ob_visit_none:${chat.id}:${todayIn(zone)}`,
    });
    await queueReply(tx, chat, {
      kind: 'buttons',
      body: MORE_WORDS.visitNone(name),
      buttons: [talk],
    });
    return;
  }
  await queueReply(tx, chat, {
    kind: 'list',
    body: MORE_WORDS.visitDay,
    button: VISIT_WORDS.pick.list,
    rows: [
      ...days.map((day) => ({
        id: `${ESTIMATE_CHOICES.pickDay}${day}`,
        title: dayWords(day),
      })),
      talk,
    ],
  });
}

/** A day that cannot be offered: today or past, a Sunday, or beyond the 45-day look-ahead. */
const badDay = (day: string, today: string) =>
  !DAY.test(day) || day <= today || !isWorkingDay(day) || day > addDays(today, 45);

/** The day tapped: Morning / Afternoon for what is still free, else the list again. */
export async function pickVisitDay(
  tx: Transaction,
  chat: Conversation,
  lead: Lead,
  day: string,
  zone: string,
): Promise<void> {
  const slots = await slotsOn(tx, lead, day, zone);
  if (slots.length === 0) {
    await queueReply(tx, chat, { kind: 'text', body: VISIT_WORDS.pick.taken });
    return askVisitDay(tx, chat, lead, zone);
  }
  await queueReply(tx, chat, {
    kind: 'buttons',
    body: MORE_WORDS.visitSlot(dayWords(day)),
    buttons: slots.map((slot) => ({
      id: `${ESTIMATE_CHOICES.pickSlot}${day}:${slot}`,
      title: VISIT_WORDS.buttons[slot],
    })),
  });
}

async function slotsOn(tx: Transaction, lead: Lead, day: string, zone: string) {
  const today = todayIn(zone);
  if (badDay(day, today)) return [];
  const taken = await takenSlots(tx, lead.ownerUserId ? [lead.ownerUserId] : [], today);
  return freeSlots(taken[day] ?? []);
}

/** The slot tapped: kept on the lead, the owner is told, the customer hears when it is confirmed. */
export async function pickVisitSlot(
  tx: Transaction,
  chat: Conversation,
  lead: Lead,
  pick: { readonly day: string; readonly slot: string },
  at: { readonly now: Date; readonly zone: string },
): Promise<void> {
  const { day, slot } = pick;
  const free = await slotsOn(tx, lead, day, at.zone);
  if (!(free as readonly string[]).includes(slot)) {
    await queueReply(tx, chat, { kind: 'text', body: VISIT_WORDS.pick.taken });
    return askVisitDay(tx, chat, lead, at.zone);
  }
  const when = `${dayWords(day)}, ${VISIT_WORDS.slots[slot as VisitSlot]}`;
  await updateLeadFromChat(
    tx,
    lead.id,
    { nextAction: { on: day, note: 'Confirm the site visit the customer picked' } },
    `Asked for a free site visit on WhatsApp: ${when} (to confirm)`,
  );
  const owned = await ensureChatOwner(tx, chat);
  await tellChatTeam(tx, owned, {
    kind: 'whatsapp_callback',
    title: `${chat.profileName ?? 'A customer'} picked ${when} for the site visit`,
    body: `${chat.phone}. Confirm the day with them.`,
    key: `ob_visit:${chat.id}:${day}:${slot}`,
  });
  const name = await answererName(tx, owned);
  const by = VISIT_WORDS.pick.by[callDay(at.now, at.zone).day];
  await queueReply(tx, chat, {
    kind: 'buttons',
    body: MORE_WORDS.visitDone(name, by),
    buttons: [talk],
  });
}
