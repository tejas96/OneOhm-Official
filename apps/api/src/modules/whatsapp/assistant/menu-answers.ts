import { Inject, Injectable } from '@nestjs/common';
import { brandName, customers } from '@oneohm/database';
import { titleCaseName } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../../../config/core.module';
import { type Conversation, queueReply } from '../chat-store';
import { AnswersService } from './answers.service';
import { setStep } from './chat-step';
import { sayWithTaps, TAP_WORDS, type Tap } from './closing-taps';
import { startComplaint } from './complaint-start';
import { FeedbackFlowService } from './feedback-flow';
import { HandOverService } from './hand-over';
import { PaperRepliesService } from './paper-replies';
import { StrangerFlowService } from './stranger-flow';
import { MENU_ROWS, type MenuChoice, WORDS } from './words';

/** The customer menu and the answer to each of its rows, each ending with taps (C5). */
@Injectable()
export class MenuAnswersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly answers: AnswersService,
    private readonly papers: PaperRepliesService,
    private readonly feedback: FeedbackFlowService,
    private readonly people: HandOverService,
    private readonly strangers: StrangerFlowService,
  ) {}

  async choose(chat: Conversation, customerId: string, choice: MenuChoice): Promise<void> {
    // With no active project, only Menu and Talk to us: the rest lead back to "no project".
    const answer = async (body: string, taps: readonly Tap[]) =>
      sayWithTaps(
        this.db,
        chat,
        body,
        (await this.answers.hasProject(customerId)) ? taps : ['menu', 'talk'],
      );
    switch (choice) {
      case 'progress':
        return answer(await this.answers.progress(customerId), ['menu', 'pay', 'talk']);
      case 'payments':
        return this.payments(chat, customerId, answer);
      case 'documents':
        return this.papers.show(chat, customerId);
      case 'requests':
        return answer(await this.answers.requests(customerId), ['menu', 'talk']);
      case 'warranty':
        return answer(await this.answers.warranty(customerId), ['menu', 'talk']);
      case 'service':
        return startComplaint(this.db, chat, customerId);
      case 'refer':
        await setStep(this.db, chat, 'await_referral');
        return sayWithTaps(this.db, chat, WORDS.askReferral, ['menu']);
      case 'rewards':
        return answer(await this.answers.rewards(customerId), ['menu', 'talk']);
      case 'feedback':
        return this.feedback.offer(chat, customerId);
      case 'human':
        return this.people.handOver(chat, 'service.manage');
    }
  }

  /** The customer's first name over the menu list; a stranger gets the stranger buttons. */
  async menu(chat: Conversation): Promise<void> {
    const [customer] = chat.customerId
      ? await this.db
          .select({ name: customers.name })
          .from(customers)
          .where(eq(customers.id, chat.customerId))
      : [];
    if (!customer) return this.strangers.answer(chat, '');
    const first = titleCaseName(customer.name.split(/\s+/)[0] ?? customer.name);
    const brand = await brandName(this.db);
    await queueReply(this.db, chat, {
      kind: 'list',
      body: WORDS.menu(first, brand),
      button: WORDS.menuButton,
      ...(brand ? { section: brand } : {}),
      rows: MENU_ROWS,
    });
  }

  /**
   * What is paid and due. Pay now buttons open our pay page; a link button has no reply
   * taps, so Menu · Talk to us follow them (menu audit M3). Without them the text carries
   * the link.
   */
  private async payments(
    chat: Conversation,
    customerId: string,
    answer: (body: string, taps: readonly Tap[]) => Promise<void>,
  ) {
    const buttons = await this.answers.payNow(customerId);
    const body = await this.answers.payments(customerId, buttons.length === 0);
    if (buttons.length === 0) return answer(body, ['menu', 'track', 'talk']);
    await queueReply(this.db, chat, { kind: 'text', body });
    for (const button of buttons) await queueReply(this.db, chat, button);
    return sayWithTaps(this.db, chat, TAP_WORDS.whatNext, ['menu', 'talk']);
  }
}
