import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { CustomerDocumentRequestsService } from '../../customer-portal/customer-document-requests.service';
import { HomeService } from '../assistant/home';
import { MEDIA_WORDS } from '../assistant/words';
import { type Conversation, lockedChat, queueReply } from '../chat-store';
import { type FlowToken, releaseFlowToken, takeFlowToken } from './flow-token';
import { answerFromForm } from './form-answer';
import { FormFileKeeper, type FormRefusal, type KeptFormFile } from './form-files';
import type { IncomingForm } from './form-reply-data';
import { FORM_WORDS } from './form-words';

const REFUSAL_WORDS: Record<FormRefusal, () => string> = {
  too_large: () => MEDIA_WORDS.tooLarge,
  wrong_type: () => MEDIA_WORDS.wrongType,
  empty: () => MEDIA_WORDS.emptyFile,
  tampered: () => MEDIA_WORDS.failed,
  failed: () => MEDIA_WORDS.failed,
};

/**
 * A customer's reply to a form we sent (`nfm_reply`). The token says what the form was for;
 * one we do not know, that is used or has expired, gets "That form is old" and Home. Each
 * file is checked and stored once, then filed as the paper the form was sent for. A file
 * that fails tells the customer its true reason once and alerts the team; the other files
 * are still saved.
 */
@Injectable()
export class FormReplyService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly files: FormFileKeeper,
    private readonly requests: CustomerDocumentRequestsService,
    private readonly home: HomeService,
  ) {}

  async receive(chat: Conversation, customerId: string, form: IncomingForm): Promise<void> {
    const token = await takeFlowToken(this.db, form.token, chat.id);
    if (!token || token.customerId !== customerId || form.files.length === 0)
      return this.old(chat, customerId, token);
    try {
      const kept: KeptFormFile[] = [];
      for (const file of form.files) kept.push(await this.files.keep(chat, customerId, file));
      await this.fileThem(chat, customerId, token, kept);
    } catch (error) {
      // Nothing was answered: give the form back so Meta's retry of this reply is handled.
      await releaseFlowToken(this.db, token.token);
      throw error;
    }
  }

  private async fileThem(
    chat: Conversation,
    customerId: string,
    token: FlowToken,
    kept: readonly KeptFormFile[],
  ) {
    const saved = kept.flatMap((file) => (file.ok ? [file] : []));
    const reasons = [...new Set(kept.flatMap((file) => (file.ok ? [] : [file.why])))];
    if (saved.length > 0) {
      await this.files.showInChat(chat, saved);
      const actionId = (token.payload as { actionId?: string }).actionId ?? '';
      await this.db.transaction(async (tx) => {
        const locked = await lockedChat(tx, chat.id);
        await answerFromForm(tx, this.requests, locked, customerId, {
          actionId,
          files: saved.map((file) => ({
            id: file.id,
            contentType: file.contentType,
            media: file.media,
          })),
          now: Date.now(),
          waitSeconds: this.env.FILE_WAIT_SECONDS,
        });
      });
    }
    // The true reason, once each: too big, a kind we cannot open, empty, or "send it again".
    for (const why of reasons)
      await queueReply(this.db, chat, { kind: 'text', body: REFUSAL_WORDS[why]() });
  }

  private async old(chat: Conversation, customerId: string, token: FlowToken | null) {
    if (token) await releaseFlowToken(this.db, token.token);
    await queueReply(this.db, chat, { kind: 'text', body: FORM_WORDS.old });
    await this.home.show(chat, customerId);
  }
}
