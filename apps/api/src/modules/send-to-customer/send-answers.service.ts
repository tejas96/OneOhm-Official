import { Inject, Injectable } from '@nestjs/common';
import { customerActions, homeNameOf } from '@oneohm/database';
import { nextActionStatus } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { logAction } from '../documents/customer-action-log';
import { sayWithTaps } from '../whatsapp/assistant/closing-taps';
import { answererName } from '../whatsapp/chat-owner';
import { type Conversation, queueReply } from '../whatsapp/chat-store';
import { FormSendService } from '../whatsapp/forms/form-send';
import { paidAnotherWayStart } from '../whatsapp/forms/paid-words';
import type { IncomingLocation } from '../whatsapp/whatsapp-events';
import { createCallbackFollowUp } from './callback-follow-up';
import { LocationPinService } from './location-pin.service';
import { callbackAsk } from './send-messages';
import { dueInstalments } from './send-reads';
import type { SendTap } from './send-taps';
import { SEND_WORDS } from './send-words';

/**
 * What the customer's taps on the team's "Send to customer" messages do (redesign §6, §10,
 * §14): the 📍 button of a closed-window template sends the location request, [I paid another
 * way] opens the proof form, a call time makes the follow-up, a home answers "which home".
 */
@Injectable()
export class SendAnswersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly forms: FormSendService,
    private readonly pins: LocationPinService,
  ) {}

  /** A pin the customer sent; false when nothing asked for it (and `onlyAsked`), or no home can take it. */
  pin(
    chat: Conversation,
    customerId: string,
    pin: IncomingLocation,
    onlyAsked = false,
  ): Promise<boolean> {
    return this.pins.receive(chat, customerId, pin, onlyAsked);
  }

  async tapped(chat: Conversation, customerId: string, tap: SendTap): Promise<void> {
    switch (tap.t) {
      case 'locreq':
        return this.askLocation(chat, customerId, tap.actionId);
      case 'paidother':
        return this.paidOther(chat, customerId, tap.milestoneId);
      case 'cbask':
        return this.pickTime(chat, customerId, tap.actionId);
      case 'callback':
        return this.callback(chat, customerId, tap.actionId, tap.slot);
      case 'home':
        return this.pins.homePicked(chat, customerId, tap.actionId, tap.propertyId);
    }
  }

  /** The template's button was tapped, so the chat is open: now the 📍 Send location message. */
  private async askLocation(chat: Conversation, customerId: string, actionId: string) {
    const [action] = await this.db
      .select()
      .from(customerActions)
      .where(
        and(
          eq(customerActions.id, actionId),
          eq(customerActions.customerId, customerId),
          eq(customerActions.type, 'location'),
          eq(customerActions.status, 'open'),
        ),
      );
    if (!action)
      return void (await queueReply(this.db, chat, { kind: 'text', body: SEND_WORDS.old }));
    const home = await homeNameOf(this.db, action.projectId, action.propertyId);
    await queueReply(this.db, chat, {
      kind: 'location_request',
      body: SEND_WORDS.location.ask(home),
    });
  }

  /** [I paid another way]: the form with the amount, day and photo; the chat fallback asks for the photo. */
  private async paidOther(chat: Conversation, customerId: string, milestoneId: string) {
    const due = (await dueInstalments(this.db, { customerId, projectId: null })).find(
      (one) => one.id === milestoneId,
    );
    if (!due) return sayWithTaps(this.db, chat, SEND_WORDS.pay.paidAlready, ['menu']);
    const amount = formatInr(due.leftPaise);
    await this.forms.sendForm(
      chat,
      customerId,
      'paid_another_way',
      paidAnotherWayStart(amount, due.home, { milestoneId }),
      SEND_WORDS.pay.chatProof,
    );
  }

  /** [Pick a time] on Home: the three time buttons for the call the team asked for. */
  private async pickTime(chat: Conversation, customerId: string, actionId: string) {
    const [action] = await this.db
      .select()
      .from(customerActions)
      .where(
        and(
          eq(customerActions.id, actionId),
          eq(customerActions.customerId, customerId),
          eq(customerActions.type, 'callback'),
          eq(customerActions.status, 'open'),
        ),
      );
    if (!action)
      return void (await queueReply(this.db, chat, { kind: 'text', body: SEND_WORDS.old }));
    const name = (await answererName(this.db, chat)) ?? SEND_WORDS.callback.team;
    for (const reply of callbackAsk('', name, action.id).replies)
      await queueReply(this.db, chat, reply);
  }

  /** A call time picked: the action closes, the follow-up is made, the customer is thanked. */
  private async callback(
    chat: Conversation,
    customerId: string,
    actionId: string,
    slot: 'morning' | 'afternoon' | 'evening',
  ) {
    const [action] = await this.db
      .select()
      .from(customerActions)
      .where(
        and(
          eq(customerActions.id, actionId),
          eq(customerActions.customerId, customerId),
          eq(customerActions.type, 'callback'),
          eq(customerActions.status, 'open'),
        ),
      );
    const next = action && nextActionStatus('callback', action.status, 'needs_check');
    if (!action || !next) {
      return void (await queueReply(this.db, chat, { kind: 'text', body: SEND_WORDS.old }));
    }
    await this.db.transaction(async (tx) => {
      const made = await createCallbackFollowUp(
        tx,
        chat,
        customerId,
        slot,
        action.id,
        this.env.BUSINESS_TIMEZONE,
      );
      await tx
        .update(customerActions)
        .set({
          status: next,
          doneAt: new Date(),
          updatedAt: new Date(),
          payload: { slot, ...made },
        })
        .where(eq(customerActions.id, action.id));
      await logAction(tx, action, {
        kind: 'customer_action',
        message: `Customer asked for a call back in the ${slot} (${made.on} ${made.time})`,
        userId: null,
        data: { customerActionId: action.id, slot },
      });
      await recordAudit(tx, null, 'customer_action.callback_picked', 'customer_action', action.id, {
        slot,
      });
    });
    const name = (await answererName(this.db, chat)) ?? SEND_WORDS.callback.team;
    await sayWithTaps(
      this.db,
      chat,
      SEND_WORDS.callback.thanks(name, SEND_WORDS.callback.slots[slot]),
      ['menu'],
    );
  }
}
