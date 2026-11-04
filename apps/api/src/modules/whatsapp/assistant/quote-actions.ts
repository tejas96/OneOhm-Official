import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database } from '../../../config/core.module';
import { QuotationsService } from '../../quotations/quotations.service';
import { QUOTE_MONEY_WORDS, quoteMoney, rupees } from '../../quotations/quote-money-words';
import { quotedSteps } from '../../quotations/quoted-terms';
import { type Conversation, queueReply } from '../chat-store';
import { sayWithTaps } from './closing-taps';
import { HandOverService } from './hand-over';
import { QUOTE_WORDS } from './quote-words';
import { WORDS } from './words';

export interface QuoteTap {
  readonly action: 'accept' | 'confirm' | 'ask';
  readonly quotationId: string;
}

const ACTIONS = { quote_accept: 'accept', quote_yes: 'confirm', quote_ask: 'ask' } as const;
const TAP =
  /^(quote_accept|quote_yes|quote_ask):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * A tap on a quote button: "Accept quote" and "I have a question" on the quote message,
 * and "Yes, accept" on the check that follows. Null for anything else.
 */
export function readQuoteTap(choiceId: string | null): QuoteTap | null {
  const match = TAP.exec(choiceId?.trim() ?? '');
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
    private readonly quotations: QuotationsService,
    private readonly people: HandOverService,
  ) {}

  /** `messageId` is the tap's own WhatsApp id: an "already accepted" reply goes once per tap. */
  async tap(chat: Conversation, tap: QuoteTap, messageId: string): Promise<void> {
    if (tap.action === 'ask') return this.people.passToOwner(chat);
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
    await queueReply(this.db, chat, {
      kind: 'buttons',
      body: QUOTE_MONEY_WORDS.confirm(rupees(quotation.totalPaise), money.first, money.firstWhen),
      buttons: [
        { id: `quote_yes:${quotationId}`, title: WORDS.quoteYes },
        { id: `quote_ask:${quotationId}`, title: WORDS.quoteNotYet },
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
