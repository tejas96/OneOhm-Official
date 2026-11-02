import { Inject, Injectable } from '@nestjs/common';
import {
  answererFor,
  brandName,
  customers,
  notifyStaffHolders,
  readBusinessSetting,
  users,
  waConversations,
  waMessages,
} from '@oneohm/database';
import {
  asksForPerson,
  findReferralCode,
  isWorkingTime,
  lastWorkEnd,
  saysHello,
} from '@oneohm/domain';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { LeadIntakeService } from '../../crm/lead-intake.service';
import { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { deskFor, ensureChatOwner, tellChatTeam } from '../chat-owner';
import { type ChatReply, type Conversation, queueReply, setState } from '../chat-store';
import type { Incoming } from '../whatsapp-events';
import { AnswersService } from './answers.service';
import { AWAIT_COMMENT, FeedbackFlowService } from './feedback-flow';
import { readReferral } from './guess-category';
import { assistantLanguage, inLanguage } from './language';
import { keepPending, MediaIntakeService } from './media-intake';
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

/**
 * The customer WhatsApp assistant (PRD 6.1): a menu over the customer's own records,
 * a few two-step requests, and a hand-over to a person. The number is the identity:
 * only a number saved on a customer sees that customer's data.
 */
const DAY_MS = 24 * 3600 * 1000;

@Injectable()
export class AssistantService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly answers: AnswersService,
    private readonly portal: CustomerPortalService,
    private readonly intake: LeadIntakeService,
    private readonly media: MediaIntakeService,
    private readonly feedback: FeedbackFlowService,
  ) {}

  /** Answers in the customer's own language (Marathi, Hindi or English). */
  async handle(chat: Conversation, incoming: Incoming): Promise<void> {
    return inLanguage(await this.languageOf(chat), () => this.answer(chat, incoming));
  }

  private async answer(chat: Conversation, incoming: Incoming): Promise<void> {
    const word = (incoming.choiceId ?? incoming.text).trim().toLowerCase();
    if (GREETINGS.has(word) || saysHello(incoming.text)) return this.restart(chat);
    if (chat.state === 'human') return;
    // Sent from the customer app's "WhatsApp your contact" button: straight to a person.
    if (incoming.kind === 'text' && asksForPerson(incoming.text)) return this.toTeam(chat);
    const code = chat.customerId ? null : findReferralCode(incoming.text);
    if (code) return this.referredFriend(chat, code, word);
    if (!chat.customerId) return this.stranger(chat, word);
    // Files are stored only for a number saved on a customer, and only against that customer.
    if (incoming.media)
      return this.media.receive(chat, chat.customerId, incoming.media, incoming.text);
    // A reply to our update ("I paid yesterday") goes to their person, even mid-step.
    if (await this.answersOurUpdate(chat, incoming, word)) return this.passToOwner(chat);
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

  /** A hello or "menu": back to the assistant, with the menu. */
  private async restart(chat: Conversation) {
    if (chat.state === 'human')
      await this.db
        .update(waConversations)
        .set({ handedOverAt: null, handledByUserId: null })
        .where(eq(waConversations.id, chat.id));
    await setState(this.db, chat.id, 'menu');
    return this.menu(chat);
  }

  private toTeam(chat: Conversation) {
    return chat.customerId
      ? this.choose(chat, chat.customerId, 'human')
      : this.stranger(chat, 'human');
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
    if (word === 'human') return this.handOver(chat, 'leads.manage');
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
  /**
   * Outside working hours, a chat with a person gets one calm reply a night saying who
   * has the message (Settings → Reminders can turn it off).
   */
  async nightReply(chat: Conversation): Promise<void> {
    const now = new Date();
    const zone = this.env.BUSINESS_TIMEZONE;
    if (isWorkingTime(now, zone)) return;
    if (!(await readBusinessSetting(this.db, 'reminders')).whatsappNightReply) return;
    const [said] = await this.db
      .select({ id: waMessages.id })
      .from(waMessages)
      .where(
        and(
          eq(waMessages.conversationId, chat.id),
          eq(waMessages.direction, 'out'),
          isNull(waMessages.sentByUserId),
          gt(waMessages.createdAt, lastWorkEnd(now, zone)),
        ),
      )
      .limit(1);
    if (said) return;
    const name = await this.answererName(chat);
    await inLanguage(await this.languageOf(chat), () =>
      this.say(chat, { kind: 'text', body: WORDS.nightReply(name) }),
    );
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

  private async passToOwner(chat: Conversation) {
    const owned = await ensureChatOwner(this.db, chat);
    return this.handOver(
      owned,
      deskFor(owned),
      WORDS.passedToOwner(await this.answererName(owned)),
    );
  }

  /** The first name of whoever answers this chat today, or null for the team. */
  private async answererName(chat: Conversation): Promise<string | null> {
    const userId = await answererFor(this.db, chat.assignedUserId ?? chat.handledByUserId);
    if (!userId) return null;
    const [user] = await this.db
      .select({ name: users.fullName })
      .from(users)
      .where(eq(users.id, userId));
    return user ? (user.name.split(/\s+/)[0] ?? user.name) : null;
  }

  private async languageOf(chat: Conversation) {
    const [customer] = chat.customerId
      ? await this.db
          .select({ language: customers.preferredLanguage })
          .from(customers)
          .where(eq(customers.id, chat.customerId))
      : [];
    return assistantLanguage(customer?.language);
  }

  private async handOver(chat: Conversation, capability: string, reply: string = WORDS.humanSoon) {
    await this.toPerson(chat);
    const owned = await ensureChatOwner(this.db, chat);
    const alert = {
      kind: 'whatsapp_handover',
      title: 'Someone wants to talk on WhatsApp',
      body: `${chat.profileName ?? 'A customer'} · ${chat.phone}`,
      key: `wa_handover:${chat.id}:${Date.now()}`,
    };
    // The owner hears first; a chat nobody owns goes to the desk that handles this kind.
    if (owned.assignedUserId) await tellChatTeam(this.db, owned, alert);
    else
      await notifyStaffHolders(this.db, capability, {
        kind: alert.kind,
        title: alert.title,
        body: alert.body,
        subject: { type: 'chat', id: chat.id },
        dedupeKey: alert.key,
      });
    return this.say(chat, { kind: 'text', body: reply });
  }

  private say(chat: Conversation, reply: ChatReply) {
    return queueReply(this.db, chat, reply);
  }
}
