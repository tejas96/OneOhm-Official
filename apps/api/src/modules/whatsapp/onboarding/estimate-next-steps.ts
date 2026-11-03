import { Inject, Injectable } from '@nestjs/common';
import { notifications, type Transaction } from '@oneohm/database';
import { addMonths, isWorkingTime, lastWorkEnd } from '@oneohm/domain';
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
import { ONBOARD_WORDS } from './onboard-words';
import { ESTIMATE_CHOICES, LATER_PERIODS, type LaterPeriod } from './onboarding-context';
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

/** After working hours the call is promised for the next morning, never "today" at 11 pm. */
function afterHours(now: Date, zone: string): boolean {
  return !isWorkingTime(now, zone) && todayIn(zone, lastWorkEnd(now, zone)) === todayIn(zone, now);
}

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

  /** True when the tap was one of the estimate's; false (typed words too) leaves it to the caller. */
  async answer(
    tx: Transaction,
    chat: Conversation,
    lead: { readonly id: string } | null,
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
      const tomorrow = afterHours(now, zone);
      const when = tomorrow ? 'tomorrow morning' : 'today';
      await updateLeadFromChat(
        tx,
        leadId,
        { nextAction: { on: tomorrow ? addDays(today, 1) : today, note: PROMISED_CALL_NOTE } },
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
      await queueReply(tx, chat, { kind: 'text', body: W.willCall(name, tomorrow) });
      return true;
    }
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
    await queueReply(tx, chat, { kind: 'text', body: W.laterThanks });
    return true;
  }
}
