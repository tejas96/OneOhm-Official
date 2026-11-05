import { Inject, Injectable } from '@nestjs/common';
import { customerActions, customers, notifyHolders, referralRewards } from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { DATABASE, type Database } from '../../config/core.module';
import { logAction } from '../documents/customer-action-log';
import { setStep } from '../whatsapp/assistant/chat-step';
import { sayWithTaps } from '../whatsapp/assistant/closing-taps';
import { type Conversation } from '../whatsapp/chat-store';
import type { IncomingForm } from '../whatsapp/forms/form-reply-data';
import { FormSendService } from '../whatsapp/forms/form-send';
import { upiFormStart } from './care-form-words';
import { REFER_WORDS } from './refer-words';
import { readUpi } from './upi';

/**
 * The customer shares the UPI ID their reward is paid to (redesign §15, owner answer 2): the form when it
 * is published, else typed in the chat and checked for the name@bank shape. It is saved on the customer
 * (UPI only), the payout ask becomes "To check" and finance is told; staff say Looks good or Ask again on
 * the reward. Nothing is paid by this: finance marks the reward paid.
 */
@Injectable()
export class UpiService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly forms: FormSendService,
  ) {}

  /** [Share UPI ID]: the form, or the question to type the answer to. */
  async start(chat: Conversation, customerId: string, actionId: string): Promise<void> {
    const ask = await this.openAsk(customerId, actionId);
    if (!ask) return sayWithTaps(this.db, chat, REFER_WORDS.upiOld, ['menu']);
    const amount = formatInr(Number(ask.payload.amountPaise ?? 0));
    if (await this.forms.available('share_upi')) {
      await this.forms.sendForm(
        chat,
        customerId,
        'share_upi',
        upiFormStart(amount, { actionId }),
        REFER_WORDS.upiType,
      );
      return;
    }
    await setStep(this.db, chat, 'await_upi', { upiAction: actionId });
    return sayWithTaps(this.db, chat, REFER_WORDS.upiType, ['menu']);
  }

  private async openAsk(customerId: string, actionId: string) {
    const [ask] = await this.db
      .select()
      .from(customerActions)
      .where(
        and(
          eq(customerActions.id, actionId),
          eq(customerActions.customerId, customerId),
          eq(customerActions.type, 'payout'),
          eq(customerActions.status, 'open'),
        ),
      );
    return ask ?? null;
  }

  /** Words typed while the chat waits for the UPI ID. */
  async typed(chat: Conversation, customerId: string, said: string): Promise<void> {
    const actionId = (chat.context as { upiAction?: string } | null)?.upiAction;
    if (!actionId) return sayWithTaps(this.db, chat, REFER_WORDS.upiOld, ['menu']);
    return this.save(chat, customerId, actionId, said, true);
  }

  /** The form came back with the UPI ID in it. */
  async fromForm(chat: Conversation, customerId: string, actionId: string, form: IncomingForm) {
    return this.save(chat, customerId, actionId, form.answers.upi ?? '', false);
  }

  private async save(
    chat: Conversation,
    customerId: string,
    actionId: string,
    said: string,
    typing: boolean,
  ): Promise<void> {
    const id = readUpi(said);
    if (!id) return sayWithTaps(this.db, chat, REFER_WORDS.upiBad, ['menu']);
    const saved = await this.db.transaction(async (tx) => {
      const [ask] = await tx
        .select()
        .from(customerActions)
        .where(
          and(
            eq(customerActions.id, actionId),
            eq(customerActions.customerId, customerId),
            eq(customerActions.type, 'payout'),
            eq(customerActions.status, 'open'),
          ),
        )
        .for('update');
      if (!ask) return false;
      const now = new Date();
      await tx
        .update(customers)
        .set({ upiId: id, upiCheckedAt: null, upiCheckedByUserId: null, updatedAt: now })
        .where(eq(customers.id, customerId));
      await tx
        .update(customerActions)
        .set({
          status: 'received',
          doneAt: now,
          updatedAt: now,
          payload: { ...ask.payload, upi: id },
        })
        .where(eq(customerActions.id, actionId));
      await logAction(tx, ask, {
        kind: 'customer_action',
        message: 'The customer shared a UPI ID for their referral reward (WhatsApp)',
        userId: null,
        data: { customerActionId: actionId },
      });
      await recordAudit(tx, null, 'customer_action.answered', 'customer_action', actionId, {
        type: 'payout',
      });
      const [reward] = await tx
        .select({ amount: referralRewards.amountPaise })
        .from(referralRewards)
        .where(eq(referralRewards.id, String(ask.payload.rewardId)));
      await notifyHolders(tx, 'finance.record_payments', {
        kind: 'referral_upi_check',
        title: 'Check a customer’s UPI ID',
        body: `${reward ? formatInr(reward.amount) : 'A reward'}: open the reward and say Looks good or Ask again.`,
        dedupeKey: `referral_upi_check:${actionId}:${id}`,
      });
      return true;
    });
    if (typing) await setStep(this.db, chat, 'menu');
    return sayWithTaps(this.db, chat, saved ? REFER_WORDS.upiThanks : REFER_WORDS.upiOld, ['menu']);
  }
}
