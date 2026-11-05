import { Inject, Injectable } from '@nestjs/common';
import { notifications, type Transaction } from '@oneohm/database';
import { addMonths, CALL_DAY_WORDS, callDay } from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { like } from 'drizzle-orm';
import { ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import {
  PROMISED_CALL_HISTORY,
  PROMISED_CALL_NOTE,
  updateLeadFromChat,
} from '../../crm/lead-from-chat';
import { HandOverService } from '../assistant/hand-over';
import { ensureChatOwner, tellChatTeam } from '../chat-owner';
import { type Conversation, queueReply } from '../chat-store';
import type { Incoming } from '../whatsapp-events';
import { askVisitDay, pickVisitDay, pickVisitSlot } from './estimate-visit';
import { ONBOARD_WORDS } from './onboard-words';
import { MORE_WORDS } from './onboard-words-more';
import {
  ESTIMATE_CHOICES,
  LATER_PERIODS,
  type LaterPeriod,
  PERSON_CHOICE,
} from './onboarding-context';
import { laterQuestion } from './onboarding-replies';

/** "Check back" dates, from today. */
const LATER: Record<
  LaterPeriod,
  { readonly label: string; readonly from: (day: string) => string }
> = {
  '1w': { label: 'in 1 week', from: (day) => addDays(day, 7) },
  '1m': { label: 'in 1 month', from: (day) => addMonths(day, 1) },
  '3m': { label: 'in 3 months', from: (day) => addMonths(day, 3) },
};

/** True when this day's call-back alert (its dedupe key) has gone out already. */
async function alertedAlready(tx: Transaction, key: string): Promise<boolean> {
  const [sent] = await tx
    .select({ id: notifications.id })
    .from(notifications)
    .where(like(notifications.dedupeKey, `${key}:%`))
    .limit(1);
  return Boolean(sent);
}

const laterPeriod = (choiceId: string): LaterPeriod | null => {
  const period = choiceId.slice(ESTIMATE_CHOICES.later.length);
  return choiceId.startsWith(ESTIMATE_CHOICES.later) &&
    (LATER_PERIODS as readonly string[]).includes(period)
    ? (period as LaterPeriod)
    : null;
};

/**
 * The customer's taps under the estimate, in the chat's transaction. "Call me back" puts
 * a call on the owner's Today (tomorrow after working hours, by the tap's time) and alerts
 * them; "Not now" asks when to check back and sets that date. ("Talk to a person" is the
 * usual hand-over.) Part 4 replaces the call back with slot booking.
 */
@Injectable()
export class EstimateNextStepsService {
  constructor(
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly people: HandOverService,
  ) {}

  /** [Book a visit] and the day and slot taps that follow it; false for any other tap. */
  private async visitTap(
    tx: Transaction,
    chat: Conversation,
    lead: { readonly id: string; readonly ownerUserId?: string | null },
    choiceId: string,
    now: Date,
  ): Promise<boolean> {
    const zone = this.env.BUSINESS_TIMEZONE;
    const given = { id: lead.id, ownerUserId: lead.ownerUserId ?? null };
    if (choiceId === ESTIMATE_CHOICES.visit) await askVisitDay(tx, chat, given, zone);
    else if (choiceId.startsWith(ESTIMATE_CHOICES.pickDay))
      await pickVisitDay(tx, chat, given, choiceId.slice(ESTIMATE_CHOICES.pickDay.length), zone);
    else if (choiceId.startsWith(ESTIMATE_CHOICES.pickSlot)) {
      const [day = '', slot = ''] = choiceId.slice(ESTIMATE_CHOICES.pickSlot.length).split(':');
      await pickVisitSlot(tx, chat, given, { day, slot }, { now, zone });
    } else return false;
    return true;
  }

  /** True when the tap was one of the estimate's; false (typed words too) leaves it to the caller. */
  async answer(
    tx: Transaction,
    chat: Conversation,
    lead: { readonly id: string; readonly ownerUserId?: string | null } | null,
    incoming: Incoming | null,
  ): Promise<boolean> {
    const choiceId = incoming?.choiceId;
    if (!lead || !choiceId) return false;
    const leadId = lead.id;
    const W = ONBOARD_WORDS;
    const zone = this.env.BUSINESS_TIMEZONE;
    const now = incoming.at;
    const today = todayIn(zone, now);
    if (choiceId === ESTIMATE_CHOICES.call) {
      // One alert and one history note a day: a second tap is already on the owner's Today.
      const key = `wa_callback:${chat.id}:${today}`;
      const again = await alertedAlready(tx, key);
      const call = callDay(now, zone);
      const when = CALL_DAY_WORDS[call.day];
      await updateLeadFromChat(
        tx,
        leadId,
        { nextAction: { on: addDays(today, call.add), note: PROMISED_CALL_NOTE } },
        again ? null : `${PROMISED_CALL_HISTORY} ${when} after the estimate`,
      );
      const owned = await ensureChatOwner(tx, chat);
      await tellChatTeam(tx, owned, {
        kind: 'whatsapp_callback',
        title: `Call back ${when}: asked after the estimate`,
        body: `${chat.profileName ?? 'A customer'} · ${chat.phone}`,
        key,
      });
      const name = await this.people.answererName(owned, tx);
      // Every closing message ends with a tap (C5): a person stays one tap away.
      await queueReply(tx, chat, {
        kind: 'buttons',
        body: W.willCall(name, call.day),
        buttons: [{ id: PERSON_CHOICE, title: W.talkToPerson }],
      });
      return true;
    }
    const visit = await this.visitTap(tx, chat, lead, choiceId, now);
    if (visit) return true;
    if (choiceId === ESTIMATE_CHOICES.notNow) {
      await queueReply(tx, chat, laterQuestion());
      return true;
    }
    const period = laterPeriod(choiceId);
    if (!period) return false;
    const later = LATER[period];
    await updateLeadFromChat(
      tx,
      leadId,
      { nextAction: { on: later.from(today), note: 'Check back (customer chose)' } },
      `Not now after the estimate: check back ${later.label}`,
    );
    await queueReply(tx, chat, {
      kind: 'buttons',
      body: W.laterThanks,
      buttons: [
        { id: ESTIMATE_CHOICES.call, title: MORE_WORDS.callMe },
        { id: PERSON_CHOICE, title: W.talkToPerson },
      ],
    });
    return true;
  }
}
