import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../../../config/core.module';
import { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { type Conversation, queueReply, setState } from '../chat-store';
import { projectToRate } from './rating-rule';
import { FEEDBACK_WORDS, RATINGS, WORDS } from './words';

/** The chat waits here for an optional comment after a rating. */
export const AWAIT_COMMENT = 'await_comment';

const MAX_COMMENT = 1000;

/**
 * "Rate us" on WhatsApp (PRD 6.1): offered once a system is switched on, saved on the same
 * feedback row the app uses (an app comment is never lost), then an optional comment.
 */
@Injectable()
export class FeedbackFlowService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly portal: CustomerPortalService,
  ) {}

  async offer(chat: Conversation, customerId: string): Promise<void> {
    const target = await this.target(customerId);
    if (target.kind !== 'rate') return this.text(chat, target.body);
    await queueReply(this.db, chat, {
      kind: 'list',
      body: WORDS.askRating,
      button: WORDS.menuButton,
      rows: RATINGS,
    });
  }

  async rate(chat: Conversation, customerId: string, rating: number): Promise<void> {
    if (!(Number.isInteger(rating) && rating >= 1 && rating <= 5))
      return this.text(chat, WORDS.notUnderstood);
    const target = await this.target(customerId);
    if (target.kind !== 'rate') return this.text(chat, target.body);
    await this.portal.feedback(customerId, { projectId: target.projectId, rating });
    await setState(this.db, chat.id, AWAIT_COMMENT, { projectId: target.projectId, rating });
    return this.text(chat, FEEDBACK_WORDS.askComment);
  }

  /** The answer to "Anything to add?": saved as the comment, unless they skip. */
  async comment(chat: Conversation, customerId: string, said: string): Promise<void> {
    const { projectId, rating } = chat.context as { projectId?: string; rating?: number };
    await setState(this.db, chat.id, 'menu');
    const comment = said.trim().slice(0, MAX_COMMENT);
    if (
      !projectId ||
      !rating ||
      !comment ||
      FEEDBACK_WORDS.skipWords.includes(comment.toLowerCase())
    )
      return this.text(chat, WORDS.ratingSaved);
    await this.portal.feedback(customerId, { projectId, rating, comment });
    return this.text(chat, FEEDBACK_WORDS.commentSaved);
  }

  private async target(
    customerId: string,
  ): Promise<{ kind: 'rate'; projectId: string } | { kind: 'wait'; body: string }> {
    const { projects } = await this.portal.home(customerId);
    if (projects.length === 0) return { kind: 'wait', body: WORDS.noProject };
    const projectId = projectToRate(projects);
    return projectId ? { kind: 'rate', projectId } : { kind: 'wait', body: FEEDBACK_WORDS.later };
  }

  private async text(chat: Conversation, body: string): Promise<void> {
    await queueReply(this.db, chat, { kind: 'text', body });
  }
}
