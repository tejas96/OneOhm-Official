import { Inject, Injectable } from '@nestjs/common';
import { customers, notifyHolders, projects, waConversations } from '@oneohm/database';
import { desc, eq } from 'drizzle-orm';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database } from '../../../config/core.module';
import { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { type ChatReply, type Conversation, queueReply, setState } from '../chat-store';
import type { Incoming } from '../whatsapp-events';
import { AnswersService } from './answers.service';
import { guessCategory, readReferral } from './guess-category';
import { MENU_ROWS, type MenuChoice, RATINGS, WORDS } from './words';

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
    if (!chat.customerId) return this.stranger(chat, word);
    if (chat.state === 'await_problem') return this.problem(chat, chat.customerId, incoming);
    if (chat.state === 'await_referral') return this.referral(chat, chat.customerId, incoming);
    if (word.startsWith('rate:')) return this.rate(chat, chat.customerId, Number(word.slice(5)));
    const byNumber = /^\d$/.test(word) ? MENU_ROWS[Number(word) - 1]?.id : undefined;
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
        await setState(this.db, chat.id, 'await_problem');
        return text(WORDS.askProblem);
      case 'refer':
        await setState(this.db, chat.id, 'await_referral');
        return text(WORDS.askReferral);
      case 'feedback':
        return this.say(chat, {
          kind: 'list',
          body: WORDS.askRating,
          button: WORDS.menuButton,
          rows: RATINGS,
        });
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
    await this.say(chat, {
      kind: 'list',
      body: WORDS.menu(first),
      button: WORDS.menuButton,
      rows: MENU_ROWS,
    });
  }

  /** Numbers we do not know see nothing private: a call back, or a person. */
  private async stranger(chat: Conversation, word: string) {
    if (word === 'callback') return this.handOver(chat, 'leads.manage', WORDS.callbackNoted);
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

  private async problem(chat: Conversation, customerId: string, incoming: Incoming) {
    const description =
      incoming.text || (incoming.kind === 'media' ? 'Photo sent on WhatsApp.' : '');
    if (description.length < 5) return this.say(chat, { kind: 'text', body: WORDS.tooShort });
    const { category, label } = guessCategory(description);
    const [project] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.customerId, customerId))
      .orderBy(desc(projects.createdAt))
      .limit(1);
    await this.portal.raiseServiceRequest(customerId, {
      projectId: project?.id ?? null,
      category,
      description: `${description} (via WhatsApp)`,
    });
    await setState(this.db, chat.id, 'menu');
    return this.say(chat, { kind: 'text', body: WORDS.problemSaved(label) });
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

  private async rate(chat: Conversation, customerId: string, rating: number) {
    const [project] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.customerId, customerId))
      .orderBy(desc(projects.createdAt))
      .limit(1);
    if (!project || !(rating >= 1 && rating <= 5))
      return this.say(chat, { kind: 'text', body: WORDS.noProject });
    await this.portal.feedback(customerId, {
      projectId: project.id,
      rating,
      comment: 'Rated on WhatsApp',
    });
    return this.say(chat, { kind: 'text', body: WORDS.ratingSaved });
  }

  /** A person takes over; the assistant stays quiet until the customer types "menu". */
  private async handOver(chat: Conversation, capability: string, reply: string = WORDS.humanSoon) {
    await this.db
      .update(waConversations)
      .set({ state: 'human', handedOverAt: new Date(), updatedAt: new Date() })
      .where(eq(waConversations.id, chat.id));
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
