import { Inject, Injectable } from '@nestjs/common';
import { customers, leads } from '@oneohm/database';
import { addDays, todayIn } from '@oneohm/shared';
import { and, eq, notInArray } from 'drizzle-orm';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { callPromise, callWhen } from '../../care/call-promise';
import { alertCall, openCallTask } from '../../care/call-task';
import { callerFor } from '../../care/care-person';
import { RATING_WORDS } from '../../care/rating-words';
import { logLead } from '../../crm/lead-history';
import { quoteIsOpen } from '../../quotations/quotation-accept';
import { QuotationsService } from '../../quotations/quotations.service';
import { QUOTE_MONEY_WORDS } from '../../quotations/quote-money-words';
import {
  QUOTE_Q_WORDS,
  QUOTE_TOPICS,
  type QuoteTopic,
} from '../../quotations/quote-question-words';
import { quoteAnswer } from '../../quotations/quote-questions';
import { changeNoteOf } from '../../quotations/quoted-terms';
import { ensureChatOwner, tellChatTeam } from '../chat-owner';
import { type Conversation, queueReply } from '../chat-store';
import { talkTitle } from './chat-words';
import { sayWithTaps } from './closing-taps';
import { HandOverService } from './hand-over';

type Quotation = Awaited<ReturnType<QuotationsService['get']>>;

/**
 * The customer's questions about an open quote (redesign §9): the list of topics, a fixed answer built
 * from the quote's own data, "Call me" (a promised call and its task), "Something else" (their person),
 * and "Not yet" (when to check back, which sets the lead's next action).
 */
@Injectable()
export class QuoteQuestionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly quotations: QuotationsService,
    private readonly people: HandOverService,
  ) {}

  /** The quote when it is the customer's and still open; else says so (and the latest papers list). */
  private async open(chat: Conversation, id: string): Promise<Quotation | null> {
    const quotation = await this.quotations.get(id).catch((error: unknown) => {
      if (error instanceof AppError) return null;
      throw error;
    });
    if (
      quotation &&
      chat.customerId &&
      quotation.customer.id === chat.customerId &&
      (await quoteIsOpen(this.db, quotation))
    )
      return quotation;
    await queueReply(this.db, chat, { kind: 'text', body: QUOTE_Q_WORDS.old });
    return null;
  }

  /** [I have a question]: the topics as a list. */
  async questions(chat: Conversation, id: string): Promise<void> {
    if (!(await this.open(chat, id))) return;
    const changed = await changeNoteOf(this.db, id);
    await queueReply(this.db, chat, {
      kind: 'list',
      body: changed
        ? `${QUOTE_Q_WORDS.changed(changed)}\n\n${QUOTE_Q_WORDS.ask}`
        : QUOTE_Q_WORDS.ask,
      button: QUOTE_Q_WORDS.button,
      rows: QUOTE_TOPICS.map((topic) => ({
        id: `quote_q:${id}:${topic}`,
        title: QUOTE_Q_WORDS.topics[topic],
      })),
    });
  }

  async topic(chat: Conversation, id: string, topic: QuoteTopic): Promise<void> {
    const quotation = await this.open(chat, id);
    if (!quotation) return;
    if (topic === 'other') return this.people.passToOwner(chat);
    if (topic === 'call') return this.callMe(chat, quotation);
    const answer = await quoteAnswer(this.db, id, topic);
    if (!answer) return this.people.passToOwner(chat);
    return sayWithTaps(this.db, chat, answer, [
      { id: `quote_accept:${id}`, title: QUOTE_MONEY_WORDS.accept },
      { id: `quote_ask:${id}`, title: QUOTE_MONEY_WORDS.ask },
    ]);
  }

  /** "Call me": the promised call is a task for the person who looks after them, with a time. */
  private async callMe(chat: Conversation, quotation: Quotation) {
    const customerId = quotation.customer.id;
    const person = await callerFor(this.db, { phone: chat.phone });
    const promise = callPromise(new Date(), this.env.BUSINESS_TIMEZONE);
    await this.db.transaction(async (tx) => {
      const made = await openCallTask(tx, {
        customerId,
        projectId: null,
        owner: person.id,
        title: `Call ${quotation.customer.name} about quote ${quotation.number}`,
        reason: 'quote',
        once: `call:quote:${quotation.id}`,
        promise,
      });
      if (!made) return;
      await alertCall(tx, {
        owner: person.id,
        projectId: null,
        title: `${quotation.customer.name} asked for a call about quote ${quotation.number}`,
        body: `They tapped Call me on WhatsApp. Please call them ${callWhen(promise)}.`,
        key: `quote_call:${quotation.id}`,
      });
      if (quotation.input.leadId)
        await logLead(
          tx,
          quotation.input.leadId,
          null,
          'follow_up',
          `Asked for a call about quote ${quotation.number} (WhatsApp).`,
        );
    });
    return sayWithTaps(
      this.db,
      chat,
      QUOTE_Q_WORDS.called(person.name ?? RATING_WORDS.team, callWhen(promise)),
      ['menu'],
    );
  }

  /** [Not yet] on the accept check: "When should we check back?" */
  async whenToCheck(chat: Conversation, id: string): Promise<void> {
    if (!(await this.open(chat, id))) return;
    const name = await this.people.answererName(chat);
    await queueReply(this.db, chat, {
      kind: 'buttons',
      body: QUOTE_Q_WORDS.checkBack,
      buttons: [
        { id: `quote_back:${id}:w`, title: QUOTE_Q_WORDS.week },
        { id: `quote_back:${id}:m`, title: QUOTE_Q_WORDS.month },
        { id: 'go:talk', title: talkTitle(name) },
      ],
    });
  }

  private async setCheckBack(leadId: string, on: string, note: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [set] = await tx
        .update(leads)
        .set({
          nextActionOn: on,
          nextActionTime: null,
          nextActionNote: note,
          updatedAt: new Date(),
        })
        .where(and(eq(leads.id, leadId), notInArray(leads.stage, ['won', 'lost'])))
        .returning({ id: leads.id });
      if (set) await logLead(tx, leadId, null, 'follow_up', `Next action on ${on}: ${note}.`);
      return Boolean(set);
    });
  }

  /** [1 week] / [1 month]: the lead's next action is that day; a customer with no lead tells their person. */
  async checkBack(chat: Conversation, id: string, later: 'w' | 'm'): Promise<void> {
    const quotation = await this.open(chat, id);
    if (!quotation) return;
    const on = addDays(todayIn(this.env.BUSINESS_TIMEZONE), later === 'w' ? 7 : 30);
    const note = `Check back with the customer about quote ${quotation.number} (they said not yet on WhatsApp)`;
    const leadId = quotation.input.leadId;
    // They may change their mind (a week, then a month): the day is replaced, never kept.
    const set = leadId ? await this.setCheckBack(leadId, on, note) : false;
    if (!set) {
      const [customer] = await this.db
        .select({ name: customers.name })
        .from(customers)
        .where(eq(customers.id, quotation.customer.id));
      const owned = await ensureChatOwner(this.db, chat);
      await tellChatTeam(this.db, owned, {
        kind: 'quote_check_back',
        title: `Check back with ${customer?.name ?? 'the customer'} on ${on}`,
        body: `They are not ready for quote ${quotation.number} yet.`,
        key: `quote_check_back:${id}:${on}`,
      });
    }
    return sayWithTaps(
      this.db,
      chat,
      QUOTE_Q_WORDS.checkBackSet(later === 'w' ? QUOTE_Q_WORDS.week : QUOTE_Q_WORDS.month),
      ['menu'],
    );
  }
}
