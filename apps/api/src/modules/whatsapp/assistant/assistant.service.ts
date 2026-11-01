import { Inject, Injectable } from '@nestjs/common';
import { brandName, customers, notifyHolders, waConversations } from '@oneohm/database';
import { findReferralCode } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database } from '../../../config/core.module';
import { LeadIntakeService } from '../../crm/lead-intake.service';
import { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { type ChatReply, type Conversation, queueReply, setState } from '../chat-store';
import type { Incoming } from '../whatsapp-events';
import { AnswersService } from './answers.service';
import { AWAIT_COMMENT, FeedbackFlowService } from './feedback-flow';
import { readReferral } from './guess-category';
import { keepPending, MediaIntakeService } from './media-intake';
import { MENU_ROWS, type MenuChoice, WORDS } from './words';

const GREETINGS = new Set(['menu', 'hi', 'hii', 'hello', 'hey', 'start', 'namaste', 'namaskar']);

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
    private readonly intake: LeadIntakeService,
    private readonly media: MediaIntakeService,
    private readonly feedback: FeedbackFlowService,
  ) {}

  async handle(chat: Conversation, incoming: Incoming): Promise<void> {
    const word = (incoming.choiceId ?? incoming.text).trim().toLowerCase();
    if (GREETINGS.has(word)) {
      if (chat.state === 'human')
        await this.db
          .update(waConversations)
          .set({ handedOverAt: null, handledByUserId: null })
          .where(eq(waConversations.id, chat.id));
      await setState(this.db, chat.id, 'menu');
      return this.menu(chat);
    }
    if (chat.state === 'human') return;
    const code = chat.customerId ? null : findReferralCode(incoming.text);
    if (code) return this.referredFriend(chat, code, word);
    if (!chat.customerId) return this.stranger(chat, word);
    // Files are stored only for a number saved on a customer, and only against that customer.
    if (incoming.media)
      return this.media.receive(chat, chat.customerId, incoming.media, incoming.text);
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
    const byNumber = /^\d{1,2}$/.test(word) ? MENU_ROWS[Number(word) - 1]?.id : undefined;
    const choice =
      byNumber ?? MENU_ROWS.find((row) => row.id === word || row.title.toLowerCase() === word)?.id;
    if (!choice) {
      await this.say(chat, { kind: 'text', body: WORDS.notUnderstood });
      return this.menu(chat);
    }
    return this.choose(chat, chat.customerId, choice);
  }

  private async choose(chat: Conversation, customerId: string, choice: MenuChoice) {
    const text = (body: string) => this.say(chat, { kind: 'text', body });
    switch (choice) {
      case 'progress':
        return text(await this.answers.progress(customerId));
      case 'payments':
        return text(await this.answers.payments(customerId));
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
        return this.handOver(chat, 'service.manage');
    }
  }

  private async menu(chat: Conversation) {
    const [customer] = chat.customerId
      ? await this.db
          .select({ name: customers.name })
          .from(customers)
          .where(eq(customers.id, chat.customerId))
      : [];
    if (!customer) return this.stranger(chat, '');
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

  /** Numbers we do not know see nothing private: a call back, or a person. */
  private async stranger(chat: Conversation, word: string) {
    if (word === 'callback') return this.callBack(chat);
    if (word === 'human') return this.handOver(chat, 'service.manage');
    await this.say(chat, {
      kind: 'buttons',
      body: WORDS.unknownNumber,
      buttons: [
        { id: 'callback', title: WORDS.callMeBack },
        { id: 'human', title: 'Talk to a person' },
      ],
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

  /** A new number with a customer's referral code becomes that customer's referral (PRD 5.6). */
  private async referredFriend(chat: Conversation, code: string, word: string) {
    try {
      const saved = await this.portal.referByCode(code, {
        name: chat.profileName?.trim() || 'WhatsApp contact',
        phone: chat.phone,
      });
      if (!saved) return this.stranger(chat, word);
      const welcome = WORDS.referredWelcome(saved.referrer, await brandName(this.db));
      return this.say(chat, { kind: 'text', body: welcome });
    } catch (error) {
      if (error instanceof AppError) return this.say(chat, { kind: 'text', body: error.message });
      throw error;
    }
  }

  /**
   * An unknown number asking for a call becomes a WhatsApp lead (PRD 3.3) with an owner by
   * rule, who gets the alert; an open lead on the number gets a nudge instead.
   */
  private async callBack(chat: Conversation) {
    await this.intake.receive({
      name: chat.profileName?.trim() || 'WhatsApp contact',
      phone: chat.phone,
      city: 'Not given',
      source: 'whatsapp',
      nextActionNote: 'Call back: asked on WhatsApp',
      firstNote: 'Asked for a call back on WhatsApp.',
    });
    await this.toPerson(chat);
    return this.say(chat, { kind: 'text', body: WORDS.callbackNoted });
  }

  private toPerson(chat: Conversation) {
    return this.db
      .update(waConversations)
      .set({ state: 'human', handedOverAt: new Date(), updatedAt: new Date() })
      .where(eq(waConversations.id, chat.id));
  }

  /** A person takes over; the assistant stays quiet until the customer types "menu". */
  private async handOver(chat: Conversation, capability: string, reply: string = WORDS.humanSoon) {
    await this.toPerson(chat);
    await notifyHolders(this.db, capability, {
      kind: 'whatsapp_handover',
      title: 'Someone wants to talk on WhatsApp',
      body: `${chat.profileName ?? 'A customer'} · ${chat.phone}`,
      dedupeKey: `wa_handover:${chat.id}:${Date.now()}`,
    });
    return this.say(chat, { kind: 'text', body: reply });
  }

  private say(chat: Conversation, reply: ChatReply) {
    return queueReply(this.db, chat, reply);
  }
}
