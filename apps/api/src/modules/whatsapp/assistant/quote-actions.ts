import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { quoteIsOpen } from '../../quotations/quotation-accept';
import { queueQuoteInChat } from '../../quotations/quotation-message';
import { QuotationsService } from '../../quotations/quotations.service';
import { QUOTE_MONEY_WORDS, quoteMoney, rupees } from '../../quotations/quote-money-words';
import {
  QUOTE_Q_WORDS,
  QUOTE_TOPICS,
  type QuoteTopic,
} from '../../quotations/quote-question-words';
import { changeNoteOf, quotedSteps } from '../../quotations/quoted-terms';
import { type Conversation, queueReply } from '../chat-store';
import { CHAT_WORDS } from './chat-words';
import { sayWithTaps } from './closing-taps';
import { HandOverService } from './hand-over';
import { PaperRepliesService } from './paper-replies';
import { QuoteQuestionsService } from './quote-questions.service';
import { QUOTE_WORDS } from './quote-words';
import { WORDS } from './words';

export interface QuoteTap {
  /** `topic` is a row of the question list, `back` one of the check-back buttons, `no` "Not yet". */
  readonly action: 'accept' | 'confirm' | 'ask' | 'show' | 'topic' | 'no' | 'back';
  readonly quotationId: string;
  readonly topic?: QuoteTopic;
  readonly later?: 'w' | 'm';
}

const ACTIONS = {
  quote_accept: 'accept',
  quote_yes: 'confirm',
  quote_ask: 'ask',
  quote_show: 'show',
  quote_no: 'no',
} as const;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const TAP = new RegExp(`^(quote_accept|quote_yes|quote_ask|quote_show|quote_no):(${UUID})$`, 'i');
const TOPIC = new RegExp(`^quote_q:(${UUID}):(${QUOTE_TOPICS.join('|')})$`, 'i');
const BACK = new RegExp(`^quote_back:(${UUID}):(w|m)$`, 'i');

/**
 * A tap on a quote button: "Accept quote" and "I have a question" on the quote message,
 * "Yes, accept" on the check that follows, and Home's "See quotation". Null for anything else.
 */
export function readQuoteTap(choiceId: string | null): QuoteTap | null {
  const id = choiceId?.trim() ?? '';
  const topic = TOPIC.exec(id);
  if (topic?.[1] && topic[2])
    return {
      action: 'topic',
      quotationId: topic[1].toLowerCase(),
      topic: topic[2].toLowerCase() as QuoteTopic,
    };
  const back = BACK.exec(id);
  if (back?.[1] && back[2])
    return {
      action: 'back',
      quotationId: back[1].toLowerCase(),
      later: back[2].toLowerCase() as 'w' | 'm',
    };
  const match = TAP.exec(id);
  if (!match?.[1] || !match[2]) return null;
  return {
    action: ACTIONS[match[1].toLowerCase() as keyof typeof ACTIONS],
    quotationId: match[2].toLowerCase(),
  };
}

/**
 * The customer answers their quote on WhatsApp (sales cycle step 6): "Accept quote" asks
 * once to confirm, "Yes, accept" accepts it as the customer's own act, and a question,
 * a "Not yet", an old quote or a family number goes to their person.
 */
@Injectable()
export class QuoteActionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly quotations: QuotationsService,
    private readonly people: HandOverService,
    private readonly papers: PaperRepliesService,
    private readonly asks: QuoteQuestionsService,
  ) {}

  /** `messageId` is the tap's own WhatsApp id: an "already accepted" reply goes once per tap. */
  async tap(chat: Conversation, tap: QuoteTap, messageId: string): Promise<void> {
    if (tap.action === 'ask') return this.asks.questions(chat, tap.quotationId);
    if (tap.action === 'topic' && tap.topic)
      return this.asks.topic(chat, tap.quotationId, tap.topic);
    if (tap.action === 'no') return this.asks.whenToCheck(chat, tap.quotationId);
    if (tap.action === 'back' && tap.later)
      return this.asks.checkBack(chat, tap.quotationId, tap.later);
    if (tap.action === 'show') return this.show(chat, tap.quotationId);
    if (tap.action === 'accept') return this.askToConfirm(chat, tap.quotationId, messageId);
    return this.accept(chat, tap.quotationId, messageId);
  }

  /**
   * "Accept your solar quotation for ₹…? The 1st instalment, ₹…, is due on acceptance." (or
   * whenever the plan's first share falls due) — only to the customer's own number. A family number
   * reaches the same chat but cannot accept: it goes to the customer's person at once,
   * whatever state the quote is in (never silent, even when it is already accepted).
   */
  private async askToConfirm(chat: Conversation, quotationId: string, messageId: string) {
    const quotation = await this.quotations.get(quotationId).catch((error: unknown) => {
      if (error instanceof AppError) return null;
      throw error;
    });
    if (!quotation || quotation.customer.id !== chat.customerId)
      return this.refuse(chat, WORDS.quoteChanged);
    if (quotation.customerPhone !== chat.phone) return this.refuse(chat, WORDS.quoteOwnerOnly);
    if (quotation.status === 'accepted') return this.already(chat, messageId);
    if (quotation.status !== 'sent') return this.refuse(chat, WORDS.quoteChanged);
    const steps = await quotedSteps(this.db, quotationId);
    const money = quoteMoney(quotation.totalPaise, quotation.subsidyPaise, steps);
    // A revision's change line comes first here too (Accept can arrive from the template's button).
    const changed = await changeNoteOf(this.db, quotationId);
    const confirm = QUOTE_MONEY_WORDS.confirm(
      rupees(quotation.totalPaise),
      money.first,
      money.firstWhen,
    );
    await queueReply(this.db, chat, {
      kind: 'buttons',
      body: changed ? `${QUOTE_Q_WORDS.changed(changed)}\n\n${confirm}` : confirm,
      buttons: [
        { id: `quote_yes:${quotationId}`, title: WORDS.quoteYes },
        { id: `quote_no:${quotationId}`, title: WORDS.quoteNotYet },
      ],
    });
  }

  private async accept(chat: Conversation, quotationId: string, messageId: string) {
    const result = chat.customerId
      ? await this.quotations.acceptByCustomer({
          customerId: chat.customerId,
          phoneE164: chat.phone,
          quotationId,
        })
      : 'not_owner';
    if (result === 'not_open') return this.refuse(chat, WORDS.quoteChanged);
    if (result === 'not_owner') return this.refuse(chat, WORDS.quoteOwnerOnly);
    if (result === 'already') return this.already(chat, messageId);
    // Accepted now: the thank-you goes once, however often "yes" arrives.
    const taps = ['menu', 'talk'] as const;
    return sayWithTaps(this.db, chat, QUOTE_WORDS.quoteThanks, taps, `quote_thanks:${quotationId}`);
  }

  /**
   * [See quotation]: the open quote's PDF and its two buttons again. One no longer open
   * (accepted, revised, expired) or not theirs is said so, then the latest papers list:
   * never an old PDF with Accept.
   */
  private async show(chat: Conversation, quotationId: string) {
    const quotation = await this.quotations.get(quotationId).catch((error: unknown) => {
      if (error instanceof AppError) return null;
      throw error;
    });
    const customerId = chat.customerId;
    if (
      quotation &&
      customerId &&
      quotation.customer.id === customerId &&
      (await quoteIsOpen(this.db, quotation))
    )
      return queueQuoteInChat(this.db, this.env, quotation, chat);
    await queueReply(this.db, chat, { kind: 'text', body: CHAT_WORDS.quoteChanged });
    if (customerId) await this.papers.show(chat, customerId);
  }

  /** Accepted before: said for each new tap, never twice for Meta's retry of one tap (H4). */
  private already(chat: Conversation, messageId: string) {
    const key = `quote_already:${messageId}`;
    return sayWithTaps(this.db, chat, QUOTE_WORDS.alreadyAccepted, ['menu'], key);
  }

  /** Says why it cannot go ahead, then hands the chat to the customer's person. */
  private async refuse(chat: Conversation, why: string) {
    await queueReply(this.db, chat, { kind: 'text', body: why });
    return this.people.passToOwner(chat);
  }
}
