import { alertVisitOwner, type Transaction } from '@oneohm/database';
import { callDay, slotHalf, slotLabel } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { loadCalendar } from '../../../common/calendar';
import { AppError } from '../../../common/http/errors';
import { tellBooked } from '../../visits/visit-booked';
import { dayWords } from '../../visits/visit-messages';
import { openVisitFor, targetOf } from '../../visits/visit-reads';
import { saveVisit } from '../../visits/visit-store';
import { daysFor, timesFor, visitRules } from '../../visits/visit-times';
import { VISIT_WORDS } from '../../visits/visit-words';
import { answererName, ensureChatOwner, tellChatTeam } from '../chat-owner';
import { type Conversation, queueReply } from '../chat-store';
import { ONBOARD_WORDS } from './onboard-words';
import { MORE_WORDS } from './onboard-words-more';
import { ESTIMATE_CHOICES, PERSON_CHOICE } from './onboarding-context';

/**
 * [Book a visit] under the estimate (redesign §16): the free site visit is booked on the LEAD by
 * taps, with the same engine as every other visit (Settings → Visits & bookings): the free days of
 * the person who comes (the lead's owner), then that day's free times, then the visit is booked —
 * at once, or for the team to confirm when Settings says so. The time is held from the tap, so two
 * customers cannot get the same time.
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const talk = { id: PERSON_CHOICE, title: ONBOARD_WORDS.talkToPerson };

interface Lead {
  readonly id: string;
  readonly ownerUserId: string | null;
}

const crewOf = (lead: Lead) => (lead.ownerUserId ? [lead.ownerUserId] : []);

/** The free days as a list, with a person always one tap away. */
export async function askVisitDay(
  tx: Transaction,
  chat: Conversation,
  lead: Lead,
  zone: string,
): Promise<void> {
  const owned = await ensureChatOwner(tx, chat);
  const name = await answererName(tx, owned);
  const days = await daysFor(tx, { crew: crewOf(lead), who: 'customer', timeZone: zone });
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
      ...days.map((day) => ({ id: `${ESTIMATE_CHOICES.pickDay}${day}`, title: dayWords(day) })),
      talk,
    ],
  });
}

/** The day tapped: its free times as a list, else "just taken" and the days again. */
export async function pickVisitDay(
  tx: Transaction,
  chat: Conversation,
  lead: Lead,
  day: string,
  zone: string,
): Promise<void> {
  const times = DAY.test(day)
    ? await timesFor(tx, day, { crew: crewOf(lead), who: 'customer', timeZone: zone })
    : [];
  if (times.length === 0) {
    await queueReply(tx, chat, { kind: 'text', body: VISIT_WORDS.pick.taken });
    return askVisitDay(tx, chat, lead, zone);
  }
  await queueReply(tx, chat, {
    kind: 'list',
    body: VISIT_WORDS.pick.time(dayWords(day)),
    button: VISIT_WORDS.pick.times,
    rows: [
      ...times.slice(0, 8).map((time) => ({
        id: `${ESTIMATE_CHOICES.pickSlot}${day}:${time.startMin}`,
        title: time.label,
      })),
      { id: ESTIMATE_CHOICES.visit, title: VISIT_WORDS.pick.otherDay },
      talk,
    ],
  });
}

/** "morning"/"afternoon" (older buttons) or minutes after midnight. */
function startOf<T extends { startMin: number }>(slot: string, times: readonly T[]): T | undefined {
  if (/^\d{1,4}$/.test(slot)) return times.find((time) => time.startMin === Number(slot));
  return times.find((time) => slotHalf(time.startMin) === slot);
}

/** The time tapped: the visit is booked on the lead (held at once), the owner told, the customer told. */
export async function pickVisitSlot(
  tx: Transaction,
  chat: Conversation,
  lead: Lead,
  pick: { readonly day: string; readonly slot: string },
  at: { readonly now: Date; readonly zone: string },
): Promise<void> {
  const { day } = pick;
  const times = DAY.test(day)
    ? await timesFor(tx, day, {
        crew: crewOf(lead),
        who: 'customer',
        now: at.now,
        timeZone: at.zone,
      })
    : [];
  const time = startOf(pick.slot, times);
  if (!time) {
    await queueReply(tx, chat, { kind: 'text', body: VISIT_WORDS.pick.taken });
    return askVisitDay(tx, chat, lead, at.zone);
  }
  const { settings } = await visitRules(tx, at.zone);
  const booked = settings.autoConfirmCustomerPicks;
  const target = await targetOf(tx, { leadId: lead.id });
  let saved: Awaited<ReturnType<typeof saveVisit>>;
  try {
    saved = await saveVisit(
      tx,
      target,
      {
        day,
        slot: slotHalf(time.startMin),
        startMin: time.startMin,
        status: booked ? 'confirmed' : 'proposed',
        by: 'customer',
        userId: null,
      },
      await openVisitFor(tx, target),
      at.now,
      at.zone,
    );
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== 'slot_taken') throw error;
    // Someone took the time between the list and the tap.
    await queueReply(tx, chat, { kind: 'text', body: VISIT_WORDS.pick.taken });
    return askVisitDay(tx, chat, lead, at.zone);
  }
  const { row, moved } = saved;
  const when = `${dayWords(day)}, ${slotLabel(time.startMin, time.endMin)}`;
  // The person who comes (and the lead's owner) hears; the chat's answerer too when it is someone else.
  await alertVisitOwner(tx, row, {
    kind: booked ? 'visit_booked' : 'visit_proposed',
    title: `${chat.profileName ?? 'A customer'} ${booked ? 'booked' : 'picked'} ${when} for the site visit`,
    body: `${chat.phone}. ${booked ? 'Booked on WhatsApp.' : 'Confirm the time with them.'}`,
    key: `ob_visit:${row.id}:${day}:${time.startMin}`,
  });
  const owned = await ensureChatOwner(tx, chat);
  if (owned.assignedUserId && owned.assignedUserId !== lead.ownerUserId)
    await tellChatTeam(tx, owned, {
      kind: 'whatsapp_callback',
      title: `${chat.profileName ?? 'A customer'} ${booked ? 'booked' : 'picked'} ${when} for the site visit`,
      body: `${chat.phone}. The lead's owner comes for the visit.`,
      key: `ob_visit_chat:${row.id}:${day}:${time.startMin}`,
    });
  if (booked) return tellBooked(tx, target, row, moved, null);
  const name = await answererName(tx, owned);
  const by = VISIT_WORDS.pick.by[callDay(at.now, await loadCalendar(tx, at.zone)).day];
  await queueReply(tx, chat, {
    kind: 'buttons',
    body: MORE_WORDS.visitDone(name, by),
    buttons: [talk],
  });
}
