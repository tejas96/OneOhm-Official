import { Inject, Injectable } from '@nestjs/common';
import { waConversations } from '@oneohm/database';
import { asksForPerson } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database } from '../../../config/core.module';
import { LeadIntakeService } from '../../crm/lead-intake.service';
import { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { type Conversation, queueReply, setState } from '../chat-store';
import { FormReplyService } from '../forms/form-reply';
import type { Incoming } from '../whatsapp-events';
import { languageTapped, payTapped, sendTapped } from './chat-choices';
import { chatLanguage, languageForMessage } from './chat-language';
import { heldStep, setStep, stepOf, WAITING_STEPS } from './chat-step';
import { CHAT_WORDS } from './chat-words';
import { sayWithTaps } from './closing-taps';
import { homeTapped, pickHome } from './complaint-start';
import { isPaperTap } from './customer-papers';
import { captureEntry } from './entry-capture';
import { AWAIT_COMMENT, FeedbackFlowService } from './feedback-flow';
import { readWhatTap, readWhereTap } from './files-wait';
import { FreeTextService } from './free-text';
import { readReferral } from './guess-category';
import { tellHandedBack } from './hand-back';
import { HandOverService } from './hand-over';
import { assistantAnswers } from './handled-taps';
import { HomeService } from './home';
import { choiceOf, restartsChat, wordOf } from './incoming-words';
import { exactChoice, smallTalkOf } from './known-words';
import { inLanguage } from './language';
import { MediaIntakeService } from './media-intake';
import { MenuAnswersService } from './menu-answers';
import { answerOptOut, optOutAsked } from './opt-out';
import { PaperRepliesService } from './paper-replies';
import { QuoteActionsService, readQuoteTap } from './quote-actions';
import { StrangerFlowService } from './stranger-flow';
import { WhatAnswerService } from './what-answer';
import { WORDS } from './words';

/** The steps that wait for typed words; the others (which home) wait for a tap. */
const TEXT_STEPS = ['await_problem', 'await_referral', AWAIT_COMMENT];

/**
 * The customer WhatsApp assistant (PRD 6.1, redesign §3, §14): Home over the customer's
 * own records, a few two-step requests, and a hand-over to a named person. The number is
 * the identity: only a number saved on a customer sees that customer's data.
 */
@Injectable()
export class AssistantService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly menus: MenuAnswersService,
    private readonly home: HomeService,
    private readonly portal: CustomerPortalService,
    private readonly media: MediaIntakeService,
    private readonly feedback: FeedbackFlowService,
    private readonly people: HandOverService,
    private readonly strangers: StrangerFlowService,
    private readonly quotes: QuoteActionsService,
    private readonly intake: LeadIntakeService,
    private readonly papers: PaperRepliesService,
    private readonly whatAnswers: WhatAnswerService,
    private readonly words: FreeTextService,
    private readonly formReplies: FormReplyService,
  ) {}

  /** Answers in the customer's own language (Marathi, Hindi or English). */
  async handle(seen: Conversation, incoming: Incoming): Promise<void> {
    // STOP and START come first, before onboarding, a person's hold on the chat or a quote tap.
    const asked = await inLanguage(await chatLanguage(this.db, seen), () =>
      answerOptOut(this.db, seen, optOutAsked(incoming)),
    );
    if (asked) return;
    const chat = await captureEntry(this.db, this.intake, seen, incoming);
    // A quote button works even while a person has the chat: accepting is the customer's act.
    const tap = readQuoteTap(incoming.choiceId);
    // A quote tap, like any tap, ends a step left waiting (review F8).
    if (tap && WAITING_STEPS.includes(stepOf(chat))) await setStep(this.db, chat, 'menu');
    const typed = incoming.kind === 'text' ? incoming.text : null;
    const waits = WAITING_STEPS.includes(stepOf(chat));
    const { language, ask } = await languageForMessage(this.db, chat, typed, waits);
    await inLanguage(language, () =>
      tap ? this.quotes.tap(chat, tap, incoming.waMessageId) : this.answer(chat, incoming),
    );
    // Devanagari we cannot place as Marathi or Hindi: answered, then asked once (§14) —
    // unless the answer opened a step that waits for words; then on a later message.
    if (ask) await this.menus.askLanguage(chat);
  }

  /** A tap Meta delivered after a newer message: said so, then Home (redesign §14). */
  async earlier(chat: Conversation, withHome = true): Promise<void> {
    if (!chat.customerId) return;
    const customerId = chat.customerId;
    await inLanguage(await chatLanguage(this.db, chat), async () => {
      await queueReply(this.db, chat, { kind: 'text', body: CHAT_WORDS.earlier });
      if (withHome) await this.home.show(chat, customerId);
    });
  }

  private async answer(chat: Conversation, incoming: Incoming): Promise<void> {
    if (restartsChat(chat, incoming)) return this.restart(chat, incoming.waMessageId);
    // With a person, the assistant answers only its own taps and its own steps' words.
    if (await this.heldByPerson(chat, incoming)) return;
    if (!chat.customerId) return this.stranger(chat, incoming, wordOf(incoming));
    const customerId = chat.customerId;
    // Sent from the customer app's "WhatsApp your contact" button: straight to a person.
    if (incoming.kind === 'text' && asksForPerson(incoming.text))
      return this.menus.choose(chat, customerId, 'talk');
    // Files are stored only for a number saved on a customer, and only against that customer.
    if (incoming.media) return this.media.receive(chat, customerId, incoming.media, incoming.text);
    // A "Send a paper" form came back: its files answer the paper it was sent for.
    if (incoming.form) return this.formReplies.receive(chat, customerId, incoming.form);
    // A location pin, a contact card or a sticker is never answered: their person is told
    // what it was (the chat shows it) and the assistant stays on. A reaction tells nobody.
    if (incoming.kind === 'other')
      return this.people.tellSent(chat, incoming.waMessageId, incoming.text, incoming.quiet);
    const waits = WAITING_STEPS.includes(stepOf(chat));
    // "ok", "thanks", 👍: a short word back (redesign §14). A step waiting for words gets
    // them first; a step waiting for a tap (which home, which paper) stays as it is.
    const wordsWait = TEXT_STEPS.includes(stepOf(chat));
    const small = incoming.kind === 'text' && !wordsWait ? smallTalkOf(incoming.text) : null;
    if (small) return this.words.smallTalk(chat, small);
    // A reply to our update ("I paid yesterday") goes to their person, even mid-step.
    if (await this.answersOurUpdate(chat, incoming)) return this.people.passToOwner(chat);
    const home = this.homeTap(chat, customerId, incoming.choiceId);
    if (home) return home;
    if (waits) {
      if (await this.step(chat, customerId, incoming)) return;
      // A tap is never the words a step waits for (menu audit H1, H2): the step ends and
      // the tap is answered as itself.
      await setStep(this.db, chat, 'menu');
    }
    return this.picked(chat, customerId, incoming);
  }

  /** A tap or typed words that pick an answer; else "Sorry, we didn't get that". */
  private picked(chat: Conversation, customerId: string, incoming: Incoming) {
    const id = incoming.choiceId;
    if (id?.startsWith('rate:')) return this.feedback.rate(chat, customerId, Number(id.slice(5)));
    const milestone = payTapped(id);
    if (milestone) return this.menus.pay(chat, customerId, milestone);
    const request = sendTapped(id);
    if (request) return this.menus.askPaper(chat, customerId, request);
    const language = languageTapped(id);
    if (language) return this.menus.language(chat, customerId, language);
    if (id && isPaperTap(id)) return this.papers.tapped(chat, customerId, id);
    const choice = choiceOf(incoming);
    if (choice) return this.menus.choose(chat, customerId, choice);
    return this.words.unknown(chat, incoming);
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
   * A home picked for a complaint (menu audit M10): the complaint goes on that home. A tap
   * on "What is this?" (or its Saved reply): the files waiting are filed as that; a home
   * picked for them ("For which home?"): they go on it. Else null.
   */
  private homeTap(chat: Conversation, customerId: string, choiceId: string | null) {
    const home = homeTapped(choiceId);
    if (home) return pickHome(this.db, chat, customerId, home);
    const what = readWhatTap(choiceId);
    if (what) return this.whatAnswers.tapped(chat, customerId, what);
    const where = readWhereTap(choiceId);
    if (where) return this.whatAnswers.homeTapped(chat, customerId, where);
    return null;
  }

  /** A held stranger has only its own Call me back / Talk to a person buttons (review F5). */
  private stranger(chat: Conversation, incoming: Incoming, word: string) {
    if (chat.state === 'human') return this.strangers.answer(chat, word);
    return this.strangers.route(chat, incoming, word);
  }

  /** The step the chat waits on takes the message; false when it is not that step's. */
  private async step(chat: Conversation, customerId: string, incoming: Incoming) {
    const step = stepOf(chat);
    if (incoming.kind === 'choice' || !TEXT_STEPS.includes(step)) return false;
    if (step === 'await_problem') await this.media.problemText(chat, customerId, incoming.text);
    else if (step === 'await_referral') await this.referral(chat, customerId, incoming);
    else if (step === AWAIT_COMMENT) await this.feedback.comment(chat, customerId, incoming.text);
    return true;
  }

  /** Free words (not one known word on its own) sent within a day of one of our updates. */
  private async answersOurUpdate(chat: Conversation, incoming: Incoming) {
    if (incoming.kind !== 'text' || exactChoice(incoming.text)) return false;
    return this.words.repliedToUpdate(chat.id);
  }

  /**
   * A hello or "menu": back to the assistant, with Home. Menu from a step inside a person's
   * hold ends only the step: the person and the reminders stay (review F2). Menu out of a
   * hold tells a customer who wrote meanwhile that their person is away (redesign §14).
   */
  private async restart(chat: Conversation, menuMessage: string) {
    const customerId = chat.customerId;
    if (heldStep(chat)) {
      await setStep(this.db, chat, 'menu');
      return customerId ? this.home.show(chat, customerId) : this.strangers.greet(chat);
    }
    if (chat.state === 'human') {
      await this.db
        .update(waConversations)
        .set({ handedOverAt: null, handledByUserId: null })
        .where(eq(waConversations.id, chat.id));
      await tellHandedBack(this.db, chat, chat.handedOverAt, false, menuMessage);
    }
    if (!customerId) return this.strangers.greet(chat);
    await setState(this.db, chat.id, 'menu');
    return this.home.show(chat, customerId);
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
      if (error instanceof AppError) return sayWithTaps(this.db, chat, error.message, ['menu']);
      throw error;
    }
    return sayWithTaps(this.db, chat, WORDS.referralSaved(friend.name), ['rewards', 'menu']);
  }

  /** Once a night, outside working hours, a chat with a person hears who has it. */
  async nightReply(chat: Conversation): Promise<void> {
    await inLanguage(await chatLanguage(this.db, chat), () => this.people.nightReply(chat));
  }
}
