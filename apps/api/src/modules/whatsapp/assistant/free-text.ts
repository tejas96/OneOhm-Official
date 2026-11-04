import { Inject, Injectable } from '@nestjs/common';
import { waMessages } from '@oneohm/database';
import { and, desc, eq, ne } from 'drizzle-orm';
import { DATABASE, type Database } from '../../../config/core.module';
import { type Conversation, queueReply } from '../chat-store';
import type { Incoming } from '../whatsapp-events';
import { markContext } from './chat-step';
import { CHAT_WORDS, talkTitle } from './chat-words';
import { sayWithTaps } from './closing-taps';
import { HandOverService } from './hand-over';
import type { SmallTalk } from './known-words';

const DAY_MS = 24 * 3600 * 1000;

/**
 * Typed words that are not a choice (redesign §14, decision 6): small talk gets a short
 * word back; words we do not know get "Sorry" with three ways on, and the second such
 * message in a row (nothing else between) goes to the customer's person, said clearly.
 */
@Injectable()
export class FreeTextService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly people: HandOverService,
  ) {}

  /** "ok", "thanks", 👍, "good morning": a short reply; no buttons, no alert, no hand-over. */
  smallTalk(chat: Conversation, kind: SmallTalk): Promise<void> {
    return queueReply(this.db, chat, { kind: 'text', body: CHAT_WORDS.smallTalk[kind] });
  }

  /** Words we did not understand: "Sorry…" [Talk to {name}] [Project update] [More]. */
  async unknown(chat: Conversation, incoming: Incoming): Promise<void> {
    if (incoming.kind === 'text' && (await this.secondInARow(chat, incoming.waMessageId))) {
      const name = await this.people.answererName(chat);
      return this.people.passToOwner(chat, {
        summary: `They wrote: "${incoming.text.slice(0, 140)}"`,
        reply: CHAT_WORDS.passedUnknown(name, this.people.when()),
      });
    }
    if (incoming.kind === 'text')
      await markContext(this.db, chat.id, { unknown: incoming.waMessageId });
    const talk = { id: 'go:talk', title: talkTitle(await this.people.answererName(chat)) };
    return sayWithTaps(this.db, chat, CHAT_WORDS.unknown, [talk, 'update', 'more']);
  }

  /** True when the customer's message just before this one was also not understood. */
  private async secondInARow(chat: Conversation, waMessageId: string): Promise<boolean> {
    const earlier = (chat.context as { unknown?: unknown } | null)?.unknown;
    if (typeof earlier !== 'string') return false;
    const [before] = await this.db
      .select({ id: waMessages.waMessageId })
      .from(waMessages)
      .where(
        and(
          eq(waMessages.conversationId, chat.id),
          eq(waMessages.direction, 'in'),
          ne(waMessages.waMessageId, waMessageId),
        ),
      )
      .orderBy(desc(waMessages.createdAt))
      .limit(1);
    return before?.id === earlier;
  }

  /** True when our last message in the chat was a business update sent in the last day. */
  async repliedToUpdate(chatId: string): Promise<boolean> {
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
}
