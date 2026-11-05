import { customerActions, type DatabaseExecutor } from '@oneohm/database';
import { and, eq, ne, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { logAction } from '../documents/customer-action-log';
import { send } from '../journey/auto-messages';
import { assistantLanguage, inLanguage } from '../whatsapp/assistant/language';
import { CATEGORY_WORDS } from '../whatsapp/assistant/words';
import type { ChatReply } from '../whatsapp/chat-reply';
import { queueReply } from '../whatsapp/chat-store';
import { careTaps } from './care-taps';
import { type Subject, subjectOf } from './rating-subject';
import { RATING_WORDS } from './rating-words';

/** What is being rated: a finished stage of a project, or a resolved problem. */
export type RatingTarget =
  | { readonly kind: 'stage'; readonly projectId: string; readonly stage: string }
  | { readonly kind: 'problem'; readonly requestId: string };

/** The five taps as one list, in the language being spoken. */
export function ratingList(actionId: string, body: string): ChatReply {
  const W = RATING_WORDS;
  return {
    kind: 'list',
    body,
    button: W.button,
    section: W.section,
    rows: W.rows.map((row, index) => ({
      id: careTaps.rate(actionId, 5 - index),
      title: row.title,
      description: row.description,
    })),
  };
}

/** The words that say what is rated, in the customer's language (a problem is named by its topic). */
function question(target: RatingTarget, subject: Subject, topic: string): string {
  const W = RATING_WORDS;
  return target.kind === 'stage'
    ? W.askStage(W.stage[subject.about] ?? subject.about)
    : W.askProblem(topic);
}

/**
 * Asks for the one rating of a finished stage or a resolved problem (redesign §13): a rating ask the
 * customer answers with 5 taps in the chat. Inside 24 hours the chat list, else the template with
 * [Rate now]. Once per stage or problem; `again` (the team's "Ask for a rating") sends the pending one
 * again but never makes a second. Returns what happened.
 */
export async function askRating(
  tx: DatabaseExecutor,
  target: RatingTarget,
  options: {
    readonly again?: boolean;
    readonly topic?: string;
    readonly userId?: string | null;
    /** The customer is in the chat now (they just tapped): the list goes straight there. */
    readonly chat?: { readonly id: string; readonly phone: string };
  } = {},
): Promise<'sent' | 'rated' | 'already_asked' | 'none'> {
  const subject = await subjectOf(tx, target);
  if (!subject) return 'none';
  if (subject.rated) return 'rated';
  const title = `Rate: ${options.topic ?? subject.about}`;
  const [made] = await tx
    .insert(customerActions)
    .values({
      type: 'rating',
      customerId: subject.customerId,
      projectId: subject.projectId,
      title,
      requestedByUserId: options.userId ?? null,
      payload: { once: subject.once, ...target },
    })
    .onConflictDoNothing()
    .returning({ id: customerActions.id });
  let id = made?.id;
  if (!id) {
    const [row] = await tx
      .select({ id: customerActions.id, status: customerActions.status })
      .from(customerActions)
      .where(
        and(
          sql`${customerActions.payload}->>'once' = ${subject.once}`,
          ne(customerActions.status, 'cancelled'),
        ),
      );
    if (row?.status !== 'open') return 'rated';
    if (!options.again) return 'already_asked';
    id = row.id;
  }
  if (made) {
    await logAction(
      tx,
      { projectId: subject.projectId, leadId: null },
      {
        kind: 'customer_action',
        message: `Asked the customer for a rating (${title.slice(6)})`,
        userId: options.userId ?? null,
        data: { customerActionId: id },
      },
    );
    await recordAudit(
      tx,
      options.userId ?? null,
      'customer_action.created',
      'customer_action',
      id,
      {
        type: 'rating',
      },
    );
  }
  const language = assistantLanguage(subject.language);
  const key = `rating_ask:${id}${made ? '' : `:${Date.now()}`}`;
  await inLanguage(language, async () => {
    const topic = options.topic ?? CATEGORY_WORDS[subject.about] ?? subject.about;
    const payload = {
      customer: subject.name.split(/\s+/)[0] ?? subject.name,
      stage: target.kind === 'stage' ? (RATING_WORDS.stage[subject.about] ?? subject.about) : topic,
      stageKey: target.kind === 'stage' ? subject.about : '',
      project: subject.projectCode,
      ratePayload: careTaps.rateGo(id),
    };
    if (options.chat) {
      await queueReply(
        tx,
        options.chat,
        ratingList(id, question(target, subject, topic)),
        null,
        key,
      );
      return;
    }
    await send(tx, subject, {
      template: 'stage_rating_request',
      payload,
      key,
      reply: async () => ratingList(id, question(target, subject, topic)),
    });
  });
  return 'sent';
}

/** Puts the five taps in the chat now (the customer tapped [Rate now] or "Rate us"). */
export async function showRatingList(
  tx: DatabaseExecutor,
  chat: { readonly id: string; readonly phone: string },
  actionId: string,
  body: string,
): Promise<void> {
  await queueReply(tx, chat, ratingList(actionId, body));
}

/** The rating was given another way (the customer app): its ask closes, so WhatsApp never asks again. */
export async function closeRatingAsk(tx: DatabaseExecutor, target: RatingTarget): Promise<void> {
  const once =
    target.kind === 'stage'
      ? `rating:stage:${target.projectId}:${target.stage}`
      : `rating:problem:${target.requestId}`;
  const now = new Date();
  await tx
    .update(customerActions)
    .set({ status: 'closed', doneAt: now, closedAt: now, updatedAt: now })
    .where(
      and(
        eq(customerActions.type, 'rating'),
        eq(customerActions.status, 'open'),
        sql`${customerActions.payload}->>'once' = ${once}`,
      ),
    );
}
