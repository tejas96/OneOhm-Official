import { Inject, Injectable } from '@nestjs/common';
import { waConversations } from '@oneohm/database';
import { isPersonDocumentCategory } from '@oneohm/domain';
import { formatInr, todayIn } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { paperKindWords } from '../../documents/paper-kind-words';
import { SEND_WORDS } from '../../send-to-customer/send-words';
import { type Conversation, queueReply } from '../chat-store';
import { FormPickService } from '../forms/form-pick';
import { FormSendService } from '../forms/form-send';
import { sendPaperStart } from '../forms/form-words';
import { AnswersService } from './answers.service';
import type { Choice } from './chat-choices';
import { saveLanguage } from './chat-language';
import { markContext, setStep, stepOf, WAITING_STEPS } from './chat-step';
import { CHAT_WORDS, LANGUAGE_BUTTONS, talkTitle } from './chat-words';
import { sayWithTaps, type TapChoice } from './closing-taps';
import { startComplaint } from './complaint-start';
import { FeedbackFlowService } from './feedback-flow';
import { HandOverService } from './hand-over';
import { HomeService } from './home';
import { type AssistantLanguage, inLanguage, languageNow } from './language';
import { PaperRepliesService } from './paper-replies';
import { pendingForCustomer } from './pending-items';
import { WORDS } from './words';

/**
 * The answer to each More row and button (redesign §3, §10, §11), each ending with the
 * next step as buttons (at most 3) and Menu as the way out. Home itself: HomeService.
 */
@Injectable()
export class MenuAnswersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly answers: AnswersService,
    private readonly papers: PaperRepliesService,
    private readonly feedback: FeedbackFlowService,
    private readonly people: HandOverService,
    private readonly home: HomeService,
    private readonly forms: FormSendService,
    private readonly picks: FormPickService,
  ) {}

  async choose(chat: Conversation, customerId: string, choice: Choice): Promise<void> {
    const say = (body: string, taps: readonly TapChoice[]) =>
      sayWithTaps(this.db, chat, body, taps);
    switch (choice) {
      case 'more':
        return this.home.more(chat);
      case 'see':
        return this.home.seeThem(chat, customerId);
      case 'update':
        return this.progress(chat, customerId);
      case 'payments':
        return this.payments(chat, customerId);
      case 'documents':
        return this.papers.show(chat, customerId);
      case 'receipts':
        return this.papers.receipts(chat, customerId);
      case 'paper':
        return this.askPaper(chat, customerId, null);
      case 'bill':
        return say(CHAT_WORDS.bill.ask, [
          { id: 'go:sendbill', title: CHAT_WORDS.buttons.sendBill },
          { id: 'go:invoices', title: CHAT_WORDS.buttons.invoice },
          'payments',
        ]);
      case 'invoices':
        return this.papers.invoices(chat, customerId);
      case 'sendbill':
        return this.askPaper(chat, customerId, null, 'electricity_bill');
      case 'problem':
        return startComplaint(this.db, chat, customerId);
      case 'problems':
      case 'visit':
        return say(await this.answers.requests(customerId), ['problem', 'menu']);
      case 'warranty':
        return say(await this.answers.warranty(customerId), ['problem', 'menu']);
      case 'refer':
        await setStep(this.db, chat, 'await_referral');
        return say(WORDS.askReferral, ['menu']);
      case 'rewards':
        return say(await this.answers.rewards(customerId), ['refer', 'menu']);
      case 'talk':
        return this.people.handOver(chat, 'service.manage');
      case 'language':
        return this.languageButtons(chat);
      case 'feedback':
        return this.feedback.offer(chat, customerId);
    }
  }

  /** Project update: one message per home; waiting on the customer adds [Send it now]. */
  private async progress(chat: Conversation, customerId: string) {
    const homes = await this.answers.progress(customerId);
    if (homes.length === 0) return this.noProject(chat);
    const sendIt = { id: 'go:paper', title: CHAT_WORDS.buttons.sendItNow };
    for (const { body, waitingOnYou } of homes)
      await sayWithTaps(
        this.db,
        chat,
        body,
        waitingOnYou ? [sendIt, 'payments', 'menu'] : ['payments', 'menu'],
      );
  }

  /**
   * Payments (redesign §10): one message per home, [Pay ₹X] when something is due now; at
   * most two messages, homes with money due first.
   */
  private async payments(chat: Conversation, customerId: string) {
    const homes = await this.answers.payments(customerId);
    if (homes.length === 0) return this.noProject(chat);
    const online = this.home.paysOnline();
    const shown = [...homes].sort((a, b) => Number(b.due !== null) - Number(a.due !== null));
    const moreDue = shown.slice(2).filter((home) => home.due !== null).length;
    for (const [index, { body: text, due }] of shown.slice(0, 2).entries()) {
      // A third home that owes is one line under the second message (redesign §10).
      const body = index === 1 && moreDue > 0 ? `${text}\n\n${CHAT_WORDS.moreDue(moreDue)}` : text;
      // Something due: [Pay ₹X] [Receipts] [I paid another way] (§10); the proof form opens from the third.
      const paid = due && {
        id: `paidother:${due.milestoneId}`,
        title: SEND_WORDS.buttons.paidOther,
      };
      const pay =
        due && online
          ? { id: `pay:${due.milestoneId}`, title: CHAT_WORDS.pay(formatInr(due.leftPaise)) }
          : null;
      const taps: readonly TapChoice[] =
        pay && paid
          ? [pay, 'receipts', paid]
          : paid
            ? [paid, 'receipts', 'menu']
            : ['receipts', 'update', 'menu'];
      await sayWithTaps(this.db, chat, body, taps);
    }
  }

  /** [Pay ₹X]: the pay-link message for that amount; paid already, the Payments answer. */
  async pay(chat: Conversation, customerId: string, milestoneId: string): Promise<void> {
    const [link] = this.home.paysOnline() ? await this.answers.payNow(customerId, milestoneId) : [];
    if (!link) return this.payments(chat, customerId);
    await queueReply(this.db, chat, link);
  }

  /**
   * Send a paper / [Send it now]: the paper we still need, named with its home, opens the
   * "Send a paper" form (up to 4 files answer that paper); without a published form it asks
   * for the photo or PDF here, which "What is this?" files. Else what we still need, else
   * "send it and tell us what it is".
   */
  async askPaper(
    chat: Conversation,
    customerId: string,
    requestId: string | null,
    category?: string,
  ) {
    const today = todayIn(this.env.BUSINESS_TIMEZONE, new Date());
    const open = (await pendingForCustomer(this.db, customerId, today)).flatMap((item) =>
      item.kind === 'paper' ? [item] : [],
    );
    const asked = category
      ? open.find((item) => item.category === category)
      : (open.find((item) => item.requestId === requestId) ??
        (open.length === 1 ? open[0] : undefined));
    if (asked) {
      // A home paper with no known home and 2+ homes: "For which home?" first, then its form.
      const paperRow = { id: asked.requestId, category: asked.category, propertyId: null };
      if (!asked.home && (await this.picks.askHome(chat, customerId, paperRow))) return;
      const paper = isPersonDocumentCategory(asked.category)
        ? paperKindWords(languageNow(), asked.category)
        : asked.title;
      const start = sendPaperStart(paper, asked.home, { actionId: asked.requestId });
      const fallback = CHAT_WORDS.paper.ask(asked.title, asked.home);
      return void (await this.forms.sendForm(chat, customerId, 'send_paper', start, fallback));
    }
    // No single paper asked: choose from the asked and missing papers, then the form opens.
    if (
      !category &&
      (await this.forms.available('send_paper')) &&
      (await this.picks.offer(chat, customerId))
    )
      return;
    const body = category
      ? CHAT_WORDS.paper.ask(CHAT_WORDS.bill.paper, null)
      : open.length > 0
        ? CHAT_WORDS.paper.list(open.map((item) => item.title).join(', '))
        : CHAT_WORDS.paper.any;
    return sayWithTaps(this.db, chat, body, ['menu']);
  }

  /**
   * Devanagari we could not place as Marathi or Hindi: asked once per chat, after the
   * answer, unless that answer opened a step waiting for words (then a later message asks).
   */
  async askLanguage(chat: Conversation): Promise<void> {
    const [now] = await this.db
      .select()
      .from(waConversations)
      .where(eq(waConversations.id, chat.id));
    if (!now || now.state === 'human' || WAITING_STEPS.includes(stepOf(now))) return;
    await markContext(this.db, chat.id, { langAsked: true });
    return this.languageButtons(chat);
  }

  /** "Which language?" with [English] [मराठी] [हिंदी], each in its own script. */
  private languageButtons(chat: Conversation) {
    const buttons = LANGUAGE_BUTTONS;
    return queueReply(this.db, chat, { kind: 'buttons', body: CHAT_WORDS.language.ask, buttons });
  }

  /** A language button: saved on the customer and the chat, then Home in that language. */
  async language(chat: Conversation, customerId: string, language: AssistantLanguage) {
    await saveLanguage(this.db, chat, language);
    await inLanguage(language, async () => {
      await queueReply(this.db, chat, { kind: 'text', body: CHAT_WORDS.language.saved });
      await this.home.show(chat, customerId);
    });
  }

  /** No active project: said so, with Talk to {name} and Menu. */
  private async noProject(chat: Conversation) {
    const talk = { id: 'go:talk', title: talkTitle(await this.people.answererName(chat)) };
    return sayWithTaps(this.db, chat, WORDS.noProject, [talk, 'menu']);
  }
}
