import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@oneohm/database';
import { addMonths } from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { updateLeadFromChat } from '../../crm/lead-from-chat';
import { HandOverService } from '../assistant/hand-over';
import { ensureChatOwner, tellChatTeam } from '../chat-owner';
import { type Conversation, queueReply } from '../chat-store';
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

const laterPeriod = (choiceId: string): LaterPeriod | null => {
  const period = choiceId.slice(ESTIMATE_CHOICES.later.length);
  return choiceId.startsWith(ESTIMATE_CHOICES.later) &&
    (LATER_PERIODS as readonly string[]).includes(period)
    ? (period as LaterPeriod)
    : null;
};

/**
 * The customer's taps under the estimate, in the chat's transaction. "Call me back" puts
 * a call on the owner's Today and alerts them; "Not now" asks when to check back and
 * sets that date. ("Talk to a person" is the usual hand-over.) Part 4 replaces the call
 * back with slot booking.
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
    choiceId: string | null,
  ): Promise<boolean> {
    if (!lead || !choiceId) return false;
    const leadId = lead.id;
    const W = ONBOARD_WORDS;
    const today = todayIn(this.env.BUSINESS_TIMEZONE);
    if (choiceId === ESTIMATE_CHOICES.call) {
      await updateLeadFromChat(
        tx,
        leadId,
        { nextAction: { on: today, note: 'Customer asked for a call after the estimate' } },
        'Asked for a call today after the estimate',
      );
      const owned = await ensureChatOwner(tx, chat);
      await tellChatTeam(tx, owned, {
        kind: 'whatsapp_callback',
        title: 'Call back today: asked after the estimate',
        body: `${chat.profileName ?? 'A customer'} · ${chat.phone}`,
        key: `wa_callback:${chat.id}:${Date.now()}`,
      });
      const name = await this.people.answererName(owned, tx);
      await queueReply(tx, chat, { kind: 'text', body: W.willCall(name) });
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
