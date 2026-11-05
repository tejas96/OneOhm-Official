import { Inject, Injectable } from '@nestjs/common';
import { customerActions } from '@oneohm/database';
import { and, asc, eq } from 'drizzle-orm';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { sayWithTaps } from '../whatsapp/assistant/closing-taps';
import { type Conversation, queueReply } from '../whatsapp/chat-store';
import type { CareTap } from './care-taps';
import { answerRating } from './rating-answer';
import { ratingList } from './rating-ask';
import { RATING_WORDS } from './rating-words';

/**
 * The customer's rating on WhatsApp (redesign §13): the one system of 5 taps for a finished stage and
 * a resolved problem. [Rate now] (template button) and "Rate us" show the pending ask's list; a tap on a
 * row saves it; 1 or 2 stars say who will call and when.
 */
@Injectable()
export class RatingsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  async tapped(
    chat: Conversation,
    customerId: string,
    tap: Extract<CareTap, { t: 'rateGo' | 'rate' }>,
  ): Promise<void> {
    if (tap.t === 'rateGo') return this.show(chat, customerId, tap.id);
    const result = await answerRating(
      this.db,
      customerId,
      tap.id,
      tap.stars,
      this.env.BUSINESS_TIMEZONE,
    );
    const W = RATING_WORDS;
    if (result.kind === 'old') return sayWithTaps(this.db, chat, W.old, ['menu']);
    if (result.kind === 'thanks') return sayWithTaps(this.db, chat, W.thanks, ['menu']);
    return sayWithTaps(this.db, chat, W.sorry(result.name ?? W.team, result.when), [
      'menu',
      'talk',
    ]);
  }

  /** The list of an ask, or "rated already" when it is closed. */
  private async show(chat: Conversation, customerId: string, id: string) {
    const [ask] = await this.db
      .select()
      .from(customerActions)
      .where(and(eq(customerActions.id, id), eq(customerActions.customerId, customerId)));
    if (ask?.status !== 'open') return sayWithTaps(this.db, chat, RATING_WORDS.old, ['menu']);
    return queueReply(this.db, chat, ratingList(id, this.question(ask.payload, ask.title)));
  }

  private question(payload: Record<string, unknown>, title: string): string {
    const W = RATING_WORDS;
    return payload.kind === 'stage'
      ? W.askStage(W.stage[String(payload.stage)] ?? String(payload.stage))
      : W.askProblem(title.replace(/^Rate: /, ''));
  }

  /** "Rate us" in More: the oldest rating still waiting, else a calm "nothing right now". */
  async offer(chat: Conversation, customerId: string): Promise<void> {
    const [ask] = await this.db
      .select({ id: customerActions.id })
      .from(customerActions)
      .where(
        and(
          eq(customerActions.customerId, customerId),
          eq(customerActions.type, 'rating'),
          eq(customerActions.status, 'open'),
        ),
      )
      .orderBy(asc(customerActions.createdAt))
      .limit(1);
    if (!ask) return sayWithTaps(this.db, chat, RATING_WORDS.nothing, ['menu', 'talk']);
    return this.show(chat, customerId, ask.id);
  }

  /** An old "rate:N" row (a list sent before this system): it answers the oldest pending ask. */
  async legacy(chat: Conversation, customerId: string, stars: number): Promise<void> {
    const [ask] = await this.db
      .select({ id: customerActions.id })
      .from(customerActions)
      .where(
        and(
          eq(customerActions.customerId, customerId),
          eq(customerActions.type, 'rating'),
          eq(customerActions.status, 'open'),
        ),
      )
      .orderBy(asc(customerActions.createdAt))
      .limit(1);
    if (!ask || stars < 1 || stars > 5) return this.offer(chat, customerId);
    // The old list had no name: say what this answer rates before saving it.
    const [row] = await this.db
      .select({ title: customerActions.title, payload: customerActions.payload })
      .from(customerActions)
      .where(eq(customerActions.id, ask.id));
    const stage = String(row?.payload.stage ?? '');
    const W = RATING_WORDS;
    const what =
      row?.payload.kind === 'stage'
        ? W.stageWhat(W.stage[stage] ?? stage)
        : W.problemWhat((row?.title ?? '').replace(/^Rate: /, ''));
    await queueReply(this.db, chat, { kind: 'text', body: W.legacyNote(what, stars) });
    return this.tapped(chat, customerId, { t: 'rate', id: ask.id, stars });
  }
}
