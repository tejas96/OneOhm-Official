import { Inject, Injectable } from '@nestjs/common';
import { brandName, customers, waConversations, waMessages } from '@oneohm/database';
import { asksForPerson, findCampaignCode, saysHello } from '@oneohm/domain';
import { and, desc, eq } from 'drizzle-orm';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database } from '../../../config/core.module';
import { LeadIntakeService } from '../../crm/lead-intake.service';
import { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { type ChatReply, type Conversation, queueReply, setState } from '../chat-store';
import type { Incoming } from '../whatsapp-events';
import { AnswersService } from './answers.service';
import { captureEntry } from './entry-capture';
import { AWAIT_COMMENT, FeedbackFlowService } from './feedback-flow';
import { readReferral } from './guess-category';
import { HandOverService } from './hand-over';
import { assistantLanguage, inLanguage } from './language';
import { keepPending, MediaIntakeService } from './media-intake';
import { answerOptOut } from './opt-out';
import { QuoteActionsService, readQuoteTap } from './quote-actions';
import { StrangerFlowService } from './stranger-flow';
import { ALL_MENU_ROWS, MENU_ROWS, type MenuChoice, WORDS } from './words';

const GREETINGS = new Set([
  'menu',
  'hi',
  'hii',
  'hello',
  'hey',
  'start',
  'namaste',
  'namaskar',
  'मेनू',
  'मेन्यू',
]);

/** A menu row picked by its number, its id, or its title in any language. */
function menuChoice(word: string): MenuChoice | undefined {
  if (/^\d{1,2}$/.test(word)) return MENU_ROWS[Number(word) - 1]?.id;
  return ALL_MENU_ROWS.find((row) => row.id === word || row.title.toLowerCase() === word)?.id;
}

/** A hello, or a new number's ad opener such as "Hi OneOhm DIWALI26": both show the first menu. */
const opensChat = (chat: Conversation, text: string) =>
  saysHello(text) || (!chat.customerId && findCampaignCode(text) !== null);

const DAY_MS = 24 * 3600 * 1000;

/**
 * The customer WhatsApp assistant (PRD 6.1): a menu over the customer's own records,
 * a few two-step requests, and a hand-over to a person. The number is the identity:
 * only a number saved on a customer sees that customer's data.
 */

@Injectable()
export class AssistantService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly answers: AnswersService,
    private readonly portal: CustomerPortalService,
    private readonly media: MediaIntakeService,
    private readonly feedback: FeedbackFlowService,
    private readonly people: HandOverService,
    private readonly strangers: StrangerFlowService,
    private readonly quotes: QuoteActionsService,
    private readonly intake: LeadIntakeService,
  ) {}

  /** Answers in the customer's own language (Marathi, Hindi or English). */
  async handle(seen: Conversation, incoming: Incoming): Promise<void> {
    // STOP and START come first, before onboarding, a person's hold on the chat or a quote tap.
    const asked = await inLanguage(await this.languageOf(seen), () =>
      incoming.kind === 'text'
        ? answerOptOut(this.db, seen, incoming.text)
        : Promise.resolve(false),
    );
    if (asked) return;
    const chat = await captureEntry(this.db, this.intake, seen, incoming);
    // A quote button works even while a person has the chat: accepting is the customer's act.
    const tap = readQuoteTap(incoming.choiceId);
    return inLanguage(await this.languageOf(chat), () =>
      tap ? this.quotes.tap(chat, tap) : this.answer(chat, incoming),
    );
  }

  private async answer(chat: Conversation, incoming: Incoming): Promise<void> {
    const word = (incoming.choiceId ?? incoming.text).trim().toLowerCase();
    if (GREETINGS.has(word) || opensChat(chat, incoming.text)) return this.restart(chat);
    if (chat.state === 'human') return;
    if (!chat.customerId) return this.strangers.route(chat, incoming, word);
    // Sent from the customer app's "WhatsApp your contact" button: straight to a person.
    if (incoming.kind === 'text' && asksForPerson(incoming.text))
      return this.choose(chat, chat.customerId, 'human');
    // Files are stored only for a number saved on a customer, and only against that customer.
    if (incoming.media)
      return this.media.receive(chat, chat.customerId, incoming.media, incoming.text);
    // A reply to our update ("I paid yesterday") goes to their person, even mid-step.
    if (await this.answersOurUpdate(chat, incoming, word)) return this.people.passToOwner(chat);
    if (chat.state === 'await_problem')
      return this.media.problemText(chat, chat.customerId, incoming.text);
    if (chat.state === 'await_referral') return this.referral(chat, chat.customerId, incoming);
    if (chat.state === AWAIT_COMMENT) {
      if (incoming.kind !== 'choice')
        return this.feedback.comment(chat, chat.customerId, incoming.text);
      await setState(this.db, chat.id, 'menu');
    }
    if (word.startsWith('rate:'))
      return this.feedback.rate(chat, chat.customerId, Number(word.slice(5)));
    const choice = menuChoice(word);
    if (!choice) return this.notInMenu(chat);
    return this.choose(chat, chat.customerId, choice);
  }

  /** Words that are not a menu choice. */
  private async notInMenu(chat: Conversation) {
    await this.say(chat, { kind: 'text', body: WORDS.notUnderstood });
    return this.menu(chat);
  }

  /** Free words (not a menu pick) sent within a day of one of our business updates. */
  private async answersOurUpdate(chat: Conversation, incoming: Incoming, word: string) {
    if (incoming.kind !== 'text' || menuChoice(word)) return false;
    return this.repliedToUpdate(chat.id);
  }

  private async choose(chat: Conversation, customerId: string, choice: MenuChoice) {
    const text = (body: string) => this.say(chat, { kind: 'text', body });
    switch (choice) {
      case 'progress':
        return text(await this.answers.progress(customerId));
      case 'payments': {
        // Pay now buttons open our pay page; without them the text carries that link.
        const buttons = await this.answers.payNow(customerId);
        await text(await this.answers.payments(customerId, buttons.length === 0));
        for (const button of buttons) await this.say(chat, button);
        return;
      }
      case 'documents':
        return text(await this.answers.documents(customerId));
      case 'requests':
        return text(await this.answers.requests(customerId));
      case 'warranty':
        return text(await this.answers.warranty(customerId));
      case 'service':
        await setState(this.db, chat.id, 'await_problem', keepPending(chat.context));
        return text(WORDS.askProblem);
      case 'refer':
        await setState(this.db, chat.id, 'await_referral');
        return text(WORDS.askReferral);
      case 'rewards':
        return text(await this.answers.rewards(customerId));
      case 'feedback':
        return this.feedback.offer(chat, customerId);
      case 'human':
        return this.people.handOver(chat, 'service.manage');
    }
  }

  /** A hello or "menu": back to the assistant, with the menu. */
  private async restart(chat: Conversation) {
    if (chat.state === 'human')
      await this.db
        .update(waConversations)
        .set({ handedOverAt: null, handledByUserId: null })
        .where(eq(waConversations.id, chat.id));
    if (!chat.customerId) return this.strangers.greet(chat);
    await setState(this.db, chat.id, 'menu');
    return this.menu(chat);
  }

  private async menu(chat: Conversation) {
    const [customer] = chat.customerId
      ? await this.db
          .select({ name: customers.name })
          .from(customers)
          .where(eq(customers.id, chat.customerId))
      : [];
    if (!customer) return this.strangers.answer(chat, '');
    const first = customer.name.split(/\s+/)[0] ?? customer.name;
    const brand = await brandName(this.db);
    await this.say(chat, {
      kind: 'list',
      body: WORDS.menu(first, brand),
      button: WORDS.menuButton,
      ...(brand ? { section: brand } : {}),
      rows: MENU_ROWS,
    });
  }

  private async referral(chat: Conversation, customerId: string, incoming: Incoming) {
    const friend = readReferral(incoming.text);
    if (!friend) return this.say(chat, { kind: 'text', body: WORDS.referralUnclear });
    await setState(this.db, chat.id, 'menu');
    try {
      await this.portal.refer(customerId, friend);
    } catch (error) {
      if (error instanceof AppError) return this.say(chat, { kind: 'text', body: error.message });
      throw error;
    }
    return this.say(chat, { kind: 'text', body: WORDS.referralSaved(friend.name) });
  }

  /** Once a night, outside working hours, a chat with a person hears who has it. */
  async nightReply(chat: Conversation): Promise<void> {
    await inLanguage(await this.languageOf(chat), () => this.people.nightReply(chat));
  }

  /** True when our last message in the chat was a business update sent in the last day. */
  private async repliedToUpdate(chatId: string): Promise<boolean> {
    const [last] = await this.db
      .select({ kind: waMessages.kind, at: waMessages.createdAt })
      .from(waMessages)
      .where(and(eq(waMessages.conversationId, chatId), eq(waMessages.direction, 'out')))
      .orderBy(desc(waMessages.createdAt))
      .limit(1);
    return last?.kind === 'template' && Date.now() - last.at.getTime() < DAY_MS;
  }

  /** A customer's saved language; a stranger's is the one picked while onboarding. */
  private async languageOf(chat: Conversation) {
    if (!chat.customerId) return assistantLanguage(chat.language);
    const [customer] = await this.db
      .select({ language: customers.preferredLanguage })
      .from(customers)
      .where(eq(customers.id, chat.customerId));
    return assistantLanguage(customer?.language);
  }

  private say(chat: Conversation, reply: ChatReply) {
    return queueReply(this.db, chat, reply);
  }
}
