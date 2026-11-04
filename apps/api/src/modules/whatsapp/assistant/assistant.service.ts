import { Inject, Injectable } from '@nestjs/common';
import { customers, waConversations, waMessages } from '@oneohm/database';
import { asksForPerson } from '@oneohm/domain';
import { and, desc, eq, ne } from 'drizzle-orm';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database } from '../../../config/core.module';
import { LeadIntakeService } from '../../crm/lead-intake.service';
import { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { type ChatReply, type Conversation, queueReply, setState } from '../chat-store';
import type { Incoming } from '../whatsapp-events';
import { heldStep, setStep, stepOf, WAITING_STEPS } from './chat-step';
import { sayWithTaps } from './closing-taps';
import { homeTapped, pickHome } from './complaint-start';
import { isPaperTap } from './customer-papers';
import { captureEntry } from './entry-capture';
import { AWAIT_COMMENT, FeedbackFlowService } from './feedback-flow';
import { fileHomeTapped } from './file-home';
import { FileHomeFlowService } from './file-home-flow';
import { FilePaperFlowService } from './file-paper-flow';
import { readReferral } from './guess-category';
import { HandOverService } from './hand-over';
import { assistantAnswers } from './handled-taps';
import { isThanks, menuChoice, restartsChat, wordOf } from './incoming-words';
import { assistantLanguage, inLanguage } from './language';
import { MediaIntakeService } from './media-intake';
import { MenuAnswersService } from './menu-answers';
import { answerOptOut, optOutAsked } from './opt-out';
import { paperTapped } from './paper-match';
import { PaperRepliesService } from './paper-replies';
import { QuoteActionsService, readQuoteTap } from './quote-actions';
import { StrangerFlowService } from './stranger-flow';
import { WORDS } from './words';

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
    private readonly menus: MenuAnswersService,
    private readonly portal: CustomerPortalService,
    private readonly media: MediaIntakeService,
    private readonly feedback: FeedbackFlowService,
    private readonly people: HandOverService,
    private readonly strangers: StrangerFlowService,
    private readonly quotes: QuoteActionsService,
    private readonly intake: LeadIntakeService,
    private readonly papers: PaperRepliesService,
    private readonly fileHomes: FileHomeFlowService,
    private readonly filePapers: FilePaperFlowService,
  ) {}

  /** Answers in the customer's own language (Marathi, Hindi or English). */
  async handle(seen: Conversation, incoming: Incoming): Promise<void> {
    // STOP and START come first, before onboarding, a person's hold on the chat or a quote tap.
    const asked = await inLanguage(await this.languageOf(seen), () =>
      answerOptOut(this.db, seen, optOutAsked(incoming)),
    );
    if (asked) return;
    const chat = await captureEntry(this.db, this.intake, seen, incoming);
    // A quote button works even while a person has the chat: accepting is the customer's act.
    const tap = readQuoteTap(incoming.choiceId);
    // A quote tap, like any tap, ends a step left waiting (review F8).
    if (tap && WAITING_STEPS.includes(stepOf(chat))) await setStep(this.db, chat, 'menu');
    return inLanguage(await this.languageOf(chat), () =>
      tap ? this.quotes.tap(chat, tap, incoming.waMessageId) : this.answer(chat, incoming),
    );
  }

  private async answer(chat: Conversation, incoming: Incoming): Promise<void> {
    const word = wordOf(incoming);
    if (restartsChat(chat, incoming)) return this.restart(chat);
    // With a person, the assistant answers only its own taps and its own steps' words.
    if (await this.heldByPerson(chat, incoming)) return;
    if (!chat.customerId) return this.stranger(chat, incoming, word);
    const customerId = chat.customerId;
    // Sent from the customer app's "WhatsApp your contact" button: straight to a person.
    if (incoming.kind === 'text' && asksForPerson(incoming.text))
      return this.menus.choose(chat, customerId, 'human');
    // Files are stored only for a number saved on a customer, and only against that customer.
    if (incoming.media) return this.media.receive(chat, customerId, incoming.media, incoming.text);
    // A location pin, a contact card or a sticker is never answered: their person is told
    // what it was (the chat shows it) and the assistant stays on.
    // A reaction (a 👍 on our message) is shown in the chat and nobody is alerted.
    if (incoming.kind === 'other')
      return this.people.tellSent(chat, incoming.waMessageId, incoming.text, incoming.quiet);
    // "ok", "thanks", 👍: a warm word back, no alert (review F7); a held chat's go to the person.
    if (this.thanksOnly(chat, incoming)) return sayWithTaps(this.db, chat, WORDS.welcome, ['menu']);
    // A reply to our update ("I paid yesterday") goes to their person, even mid-step.
    if (await this.answersOurUpdate(chat, incoming, word)) return this.people.passToOwner(chat);
    const home = this.homeTap(chat, customerId, incoming.choiceId);
    if (home) return home;
    if (WAITING_STEPS.includes(stepOf(chat))) {
      if (await this.step(chat, customerId, incoming)) return;
      // A tap is never the words a step waits for (menu audit H1, H2): the step ends and
      // the tap is answered as itself.
      await setStep(this.db, chat, 'menu');
    }
    if (word.startsWith('rate:'))
      return this.feedback.rate(chat, customerId, Number(word.slice(5)));
    const choice = menuChoice(word);
    if (choice) return this.menus.choose(chat, customerId, choice);
    if (incoming.choiceId && isPaperTap(incoming.choiceId))
      return this.papers.tapped(chat, customerId, incoming.choiceId);
    // Typed words the bot does not know reach a person, warmly (menu audit M11).
    if (incoming.kind === 'text') return this.people.passToOwner(chat);
    await this.say(chat, { kind: 'text', body: WORDS.notUnderstood });
    return this.menus.menu(chat);
  }

  /**
   * A person has the chat, so the assistant stays quiet. A photo or paper is still filed:
   * on the request it answers, or after "Which home?", which the person sees go out.
   */
  private async heldByPerson(chat: Conversation, incoming: Incoming): Promise<boolean> {
    if (chat.state !== 'human' || assistantAnswers(chat, incoming)) return false;
    if (chat.customerId && incoming.media)
      await this.media.receive(chat, chat.customerId, incoming.media, incoming.text);
    return true;
  }

  /**
   * A home picked for a complaint (menu audit M10): the complaint goes on that home. One
   * picked for the files just sent ("Which home?"): they are filed on it; a paper picked
   * for them ("Which paper?"): they answer it. Else null.
   */
  private homeTap(chat: Conversation, customerId: string, choiceId: string | null) {
    const home = homeTapped(choiceId);
    if (home) return pickHome(this.db, chat, customerId, home);
    if (choiceId && fileHomeTapped(choiceId))
      return this.fileHomes.tapped(chat, customerId, choiceId);
    if (choiceId && paperTapped(choiceId))
      return this.filePapers.tapped(chat, customerId, choiceId);
    return null;
  }

  /** A held stranger has only its own Call me back / Talk to a person buttons (review F5). */
  private stranger(chat: Conversation, incoming: Incoming, word: string) {
    if (chat.state === 'human') return this.strangers.answer(chat, word);
    return this.strangers.route(chat, incoming, word);
  }

  /** A typed "ok" or "thanks" while no step waits for words. */
  private thanksOnly(chat: Conversation, incoming: Incoming) {
    if (incoming.kind !== 'text' || WAITING_STEPS.includes(stepOf(chat))) return false;
    return isThanks(incoming.text);
  }

  /** The step the chat waits on takes the message; false when it is not that step's. */
  private async step(chat: Conversation, customerId: string, incoming: Incoming) {
    const step = stepOf(chat);
    // The which-home and which-paper lists wait for a tap; typed words there are read as usual.
    if (
      incoming.kind === 'choice' ||
      ['await_home', 'await_file_home', 'await_file_paper'].includes(step)
    )
      return false;
    if (step === 'await_problem') await this.media.problemText(chat, customerId, incoming.text);
    else if (step === 'await_referral') await this.referral(chat, customerId, incoming);
    else if (step === AWAIT_COMMENT) await this.feedback.comment(chat, customerId, incoming.text);
    return true;
  }

  /** Free words (not a menu pick) sent within a day of one of our business updates. */
  private async answersOurUpdate(chat: Conversation, incoming: Incoming, word: string) {
    if (incoming.kind !== 'text' || menuChoice(word)) return false;
    return this.repliedToUpdate(chat.id);
  }

  /**
   * A hello or "menu": back to the assistant, with the menu. Menu from a step inside a
   * person's hold ends only the step: the person and the reminders stay (review F2).
   */
  private async restart(chat: Conversation) {
    if (heldStep(chat)) {
      await setStep(this.db, chat, 'menu');
      return this.menus.menu(chat);
    }
    if (chat.state === 'human')
      await this.db
        .update(waConversations)
        .set({ handedOverAt: null, handledByUserId: null })
        .where(eq(waConversations.id, chat.id));
    if (!chat.customerId) return this.strangers.greet(chat);
    await setState(this.db, chat.id, 'menu');
    return this.menus.menu(chat);
  }

  private async referral(chat: Conversation, customerId: string, incoming: Incoming) {
    const friend = readReferral(incoming.text);
    if (!friend) return sayWithTaps(this.db, chat, WORDS.referralUnclear, ['menu']);
    await setStep(this.db, chat, 'menu');
    try {
      await this.portal.refer(customerId, friend);
    } catch (error) {
      if (error instanceof AppError && error.code === 'duplicate')
        return sayWithTaps(this.db, chat, WORDS.referralKnown, ['menu']);
      if (error instanceof AppError) return this.say(chat, { kind: 'text', body: error.message });
      throw error;
    }
    return sayWithTaps(this.db, chat, WORDS.referralSaved(friend.name), ['menu']);
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
      .where(
        and(
          eq(waMessages.conversationId, chatId),
          eq(waMessages.direction, 'out'),
          ne(waMessages.kind, 'note'),
        ),
      )
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
