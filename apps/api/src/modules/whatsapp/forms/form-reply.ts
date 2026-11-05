import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { ReferralChatService } from '../../care/referral-chat.service';
import { UpiService } from '../../care/upi.service';
import { CustomerDocumentRequestsService } from '../../customer-portal/customer-document-requests.service';
import { SurveyChatService } from '../../self-survey/survey-chat.service';
import { sayWithTaps } from '../assistant/closing-taps';
import type { Chosen } from '../assistant/files-wait';
import { HomeService } from '../assistant/home';
import { takePaymentProof } from '../assistant/payment-proof';
import { ProblemFlowService } from '../assistant/problem-flow';
import { WHAT_WORDS } from '../assistant/what-words';
import { MEDIA_WORDS } from '../assistant/words';
import { tellChatTeam } from '../chat-owner';
import { type Conversation, lockedChat, queueReply } from '../chat-store';
import type { Incoming } from '../whatsapp-events';
import { type FlowToken, releaseFlowToken, takeFlowToken } from './flow-token';
import { answerFromForm } from './form-answer';
import { FormFileKeeper, type FormRefusal, type KeptFormFile, showFormFiles } from './form-files';
import { type IncomingForm } from './form-reply-data';
import { FORM_WORDS } from './form-words';
import { dayFrom, paiseFrom } from './paid-parse';

const REFUSAL_WORDS: Record<FormRefusal, () => string> = {
  too_large: () => MEDIA_WORDS.tooLarge,
  wrong_type: () => MEDIA_WORDS.wrongType,
  empty: () => MEDIA_WORDS.emptyFile,
  changed: () => MEDIA_WORDS.failed,
  failed: () => MEDIA_WORDS.failed,
};

/** What the form was sent for: an asked paper, or a checklist paper on a home. */
function chosenBy(payload: Record<string, unknown>): Chosen | null {
  if (typeof payload.actionId === 'string') return { kind: 'ask', actionId: payload.actionId };
  if (typeof payload.key === 'string')
    return {
      kind: 'item',
      key: payload.key,
      propertyId: typeof payload.propertyId === 'string' ? payload.propertyId : null,
    };
  return null;
}

/**
 * A customer's reply to a form we sent (`nfm_reply`). The token says what the form was for;
 * one we do not know, that is used or has expired, gets "That form is old" (and Home, unless a
 * person has the chat). A valid token with no readable file is not "old": the team is told and
 * the customer is asked for the photo here. Each file is checked and stored once, then filed as
 * the paper the form was sent for. A file that fails tells the customer its true reason once
 * and alerts the team; the other files are still saved.
 */
@Injectable()
export class FormReplyService {
  private readonly log = new Logger('WhatsApp');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly files: FormFileKeeper,
    private readonly requests: CustomerDocumentRequestsService,
    private readonly home: HomeService,
    private readonly survey: SurveyChatService,
    private readonly problems: ProblemFlowService,
    private readonly referrals: ReferralChatService,
    private readonly upi: UpiService,
  ) {}

  async receive(chat: Conversation, customerId: string, incoming: Incoming): Promise<void> {
    const form = incoming.form;
    if (!form) return;
    const token = await takeFlowToken(this.db, form.token, chat.id);
    if (!token || token.customerId !== customerId) return this.old(chat, customerId);
    // The self-survey form carries answers and one photo per screen: the survey keeps them.
    if (token.formKey === 'self_survey') {
      try {
        return await this.survey.fromForm(chat, customerId, String(token.payload.actionId), form);
      } catch (error) {
        await releaseFlowToken(this.db, token.token);
        throw error;
      }
    }
    // The problem, refer-a-friend and UPI forms carry choices and typed words, not papers.
    if (['report_problem', 'refer_friend', 'share_upi'].includes(token.formKey)) {
      try {
        return await this.careForm(chat, customerId, token, form);
      } catch (error) {
        await releaseFlowToken(this.db, token.token);
        throw error;
      }
    }
    if (form.files.length === 0) {
      this.log.warn(
        `Form reply ${incoming.waMessageId} had no readable file (keys: ${form.keys.join(',')}).`,
      );
      await releaseFlowToken(this.db, token.token);
      await tellChatTeam(this.db, chat, {
        kind: 'whatsapp_file_failed',
        title: 'WhatsApp form came back empty',
        body: `${chat.profileName ?? chat.phone} sent a form but no file could be read from it. Ask them to send the photo in the chat.`,
        key: `wa_form_empty:${incoming.waMessageId}`,
      }).catch((error) => this.log.error(`Could not alert about an empty form: ${String(error)}`));
      return void (await queueReply(this.db, chat, { kind: 'text', body: FORM_WORDS.noFile }));
    }
    try {
      const kept: KeptFormFile[] = [];
      for (const file of form.files) kept.push(await this.files.keep(chat, customerId, file));
      await this.fileThem(chat, customerId, token, kept, form);
    } catch (error) {
      // Nothing was answered: give the form back so Meta's retry of this reply is handled.
      await releaseFlowToken(this.db, token.token);
      throw error;
    }
  }

  private careForm(chat: Conversation, customerId: string, token: FlowToken, form: IncomingForm) {
    if (token.formKey === 'report_problem') {
      const topic = typeof token.payload.topic === 'string' ? token.payload.topic : undefined;
      return this.problems.fromForm(chat, customerId, form, topic);
    }
    if (token.formKey === 'refer_friend') return this.referrals.fromForm(chat, customerId, form);
    return this.upi.fromForm(chat, customerId, String(token.payload.actionId), form);
  }

  private async fileThem(
    chat: Conversation,
    customerId: string,
    token: FlowToken,
    kept: readonly KeptFormFile[],
    form: IncomingForm,
  ) {
    const saved = kept.flatMap((file) => (file.ok ? [file] : []));
    const reasons = [...new Set(kept.flatMap((file) => (file.ok ? [] : [file.why])))];
    const chosen = chosenBy(token.payload);
    if (saved.length > 0 && token.formKey === 'paid_another_way') {
      await this.takeProof(chat, customerId, token, saved, form);
    } else if (saved.length > 0 && chosen) {
      await this.db.transaction(async (tx) => {
        const locked = await lockedChat(tx, chat.id);
        await showFormFiles(tx, chat.id, saved);
        await answerFromForm(tx, this.requests, locked, customerId, {
          chosen,
          files: saved.map((file) => ({
            id: file.id,
            contentType: file.contentType,
            media: file.media,
          })),
          now: Date.now(),
          waitSeconds: this.env.FILE_WAIT_SECONDS,
          homeId: typeof token.payload.propertyId === 'string' ? token.payload.propertyId : null,
        });
      });
    }
    // The true reason, once each: too big, a kind we cannot open, empty, or "send it again".
    for (const why of reasons)
      await queueReply(this.db, chat, { kind: 'text', body: REFUSAL_WORDS[why]() });
  }

  /** Proof of a payment made another way: filed, finance told, reminders paused, customer thanked. */
  private async takeProof(
    chat: Conversation,
    customerId: string,
    token: FlowToken,
    saved: readonly Extract<KeptFormFile, { ok: true }>[],
    form: IncomingForm,
  ) {
    const milestoneId =
      typeof token.payload.milestoneId === 'string' ? token.payload.milestoneId : null;
    await this.db.transaction(async (tx) => {
      const locked = await lockedChat(tx, chat.id);
      await showFormFiles(tx, chat.id, saved);
      await takePaymentProof(
        tx,
        customerId,
        saved.map((file) => ({ id: file.id, contentType: file.contentType })),
        Date.now(),
        { milestoneId, amountPaise: paiseFrom(form.amount), paidOn: dayFrom(form.date) },
      );
      await sayWithTaps(tx, locked, WHAT_WORDS.payment, ['menu']);
    });
  }

  private async old(chat: Conversation, customerId: string) {
    await queueReply(this.db, chat, { kind: 'text', body: FORM_WORDS.old });
    // A person who has the chat keeps it: no Home from the bot.
    if (chat.state !== 'human') await this.home.show(chat, customerId);
  }
}
