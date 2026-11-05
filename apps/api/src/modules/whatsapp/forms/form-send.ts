import { Inject, Injectable } from '@nestjs/common';
import { waForms } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../../../config/core.module';
import { sayWithTaps } from '../assistant/closing-taps';
import { type Conversation, queueReply } from '../chat-store';
import { issueFlowToken } from './flow-token';
import type { FormKey } from './form-registry';
import { FORM_LIMITS } from './form-words';

const WINDOW_MS = 24 * 3_600_000;

/** What a form message says, and what its reply is for. */
export interface FormStart {
  readonly body: string;
  readonly button: string;
  readonly screen: string;
  readonly data: Readonly<
    Record<string, string | boolean | readonly { id: string; title: string }[]>
  >;
  /** Saved with the token: what the reply answers. */
  readonly payload: Record<string, unknown>;
}

/**
 * Sends a WhatsApp form through the outbox (the worker delivers it as an interactive flow
 * message), only inside the 24-hour window and only when the form is published (its flow id
 * is saved in Settings). Otherwise, `fallbackText` goes in its place with Menu: the form is
 * simply not available. The form's own message ends "Or just send the photo here".
 */
@Injectable()
export class FormSendService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** The published flow id of a form; null when it is not published. */
  async flowIdOf(key: FormKey): Promise<string | null> {
    const [row] = await this.db.select().from(waForms).where(eq(waForms.key, key));
    return row?.flowId?.trim() || null;
  }

  /** Whether a form can be offered now: it is published. */
  async available(key: FormKey): Promise<boolean> {
    return (await this.flowIdOf(key)) !== null;
  }

  async sendForm(
    chat: Conversation,
    customerId: string,
    formKey: FormKey,
    start: FormStart,
    fallbackText: string,
  ): Promise<'form' | 'fallback'> {
    const flowId = await this.flowIdOf(formKey);
    const open = chat.lastInboundAt && Date.now() - chat.lastInboundAt.getTime() < WINDOW_MS;
    if (!flowId || !open) {
      await sayWithTaps(this.db, chat, fallbackText, ['menu']);
      return 'fallback';
    }
    const token = await issueFlowToken(this.db, {
      formKey,
      conversationId: chat.id,
      customerId,
      payload: start.payload,
    });
    await queueReply(this.db, chat, {
      kind: 'flow',
      body: start.body.slice(0, FORM_LIMITS.body),
      button: start.button,
      flowId,
      token,
      screen: start.screen,
      data: start.data,
      fallbackText,
    });
    return 'form';
  }
}
