import { Inject, Injectable } from '@nestjs/common';
import type { CustomerStageCard, NewStageRating, StageRating } from '@oneohm/api-contracts';
import {
  customers,
  localAlertTitle,
  notify,
  projects,
  stageRatingPeople,
  stageRatings,
} from '@oneohm/database';
import { checkRating, LOW_RATING } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { suggestStageRatingPoints } from '../workforce/points';
import { customerStageCards, readStageRatings } from './stage-ratings-read';

const STAGE_NAME = {
  survey: 'site survey',
  installation: 'installation',
  commissioning: 'switch-on and handover',
} as const;

/**
 * Customers rate each finished stage and, if they wish, the people who did it (PRD 5.7).
 * Safeguards: only finished stages of their own projects, once per stage, a reason for
 * low stars, and only people who really worked on that stage.
 */
@Injectable()
export class StageRatingsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  cards(customerId: string): Promise<CustomerStageCard[]> {
    return customerStageCards(this.db, customerId);
  }

  async rate(customerId: string, input: NewStageRating): Promise<CustomerStageCard> {
    const problem = checkRating(input.rating, input.comment);
    if (problem === 'comment_needed') {
      throw invalid('Tell us what went wrong, in a few words.', {
        comment: 'Needed for 1 or 2 stars.',
      });
    }
    if (problem) throw invalid('Choose 1 to 5 stars.', { rating: 'Out of range.' });
    const card = (await this.cards(customerId)).find(
      (item) => item.projectId === input.projectId && item.stage === input.stage,
    );
    if (!card) throw notFound('That finished stage');
    if (card.rating) throw conflict('You have already rated this stage. Thank you.', 'rated');
    const workers = new Set(card.people.map((person) => person.userId));
    const people = (input.people ?? []).filter((person) => workers.has(person.userId));
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(stageRatings)
        .values({
          projectId: input.projectId,
          customerId,
          stage: input.stage,
          rating: input.rating,
          comment: input.comment?.trim() || null,
        })
        .onConflictDoNothing()
        .returning({ id: stageRatings.id });
      if (!row) throw conflict('You have already rated this stage. Thank you.', 'rated');
      if (people.length > 0) {
        await tx
          .insert(stageRatingPeople)
          .values(people.map((person) => ({ ratingId: row.id, ...person })));
        // Flow G: 4 or 5 stars for named staff suggests points for a manager to approve.
        await suggestStageRatingPoints(tx, row.id);
      }
      const [project] = await tx
        .select({ manager: projects.managerUserId, customer: customers.name })
        .from(projects)
        .innerJoin(customers, eq(customers.id, projects.customerId))
        .where(eq(projects.id, input.projectId));
      if (project?.manager) {
        const low = input.rating <= LOW_RATING;
        await notify(
          tx,
          { userId: project.manager },
          {
            kind: low ? 'stage_rating_low' : 'stage_rated',
            title: `${low ? 'Low rating: ' : ''}${project.customer} gave the ${STAGE_NAME[input.stage]} ${input.rating}/5`,
            body: input.comment?.trim() || `${card.projectCode}: no comment.`,
            subject: { type: 'project', id: input.projectId, projectId: input.projectId },
            dedupeKey: `stage_rated:${row.id}`,
          },
        );
      }
    });
    const updated = (await this.cards(customerId)).find(
      (item) => item.projectId === input.projectId && item.stage === input.stage,
    );
    if (!updated) throw notFound('That finished stage');
    return updated;
  }

  async forProject(actor: Actor, projectId: string): Promise<StageRating[]> {
    assertCan(actor, 'projects.view_all', 'customers.view');
    return readStageRatings(this.db, eq(stageRatings.projectId, projectId));
  }

  async reply(actor: Actor, id: string, reply: string): Promise<StageRating> {
    assertCan(actor, 'projects.manage', 'customers.manage');
    const [rating] = await this.db
      .select({
        customerId: stageRatings.customerId,
        stage: stageRatings.stage,
        language: customers.preferredLanguage,
      })
      .from(stageRatings)
      .innerJoin(customers, eq(customers.id, stageRatings.customerId))
      .where(eq(stageRatings.id, id));
    if (!rating) throw notFound('That rating');
    await this.db.transaction(async (tx) => {
      await tx
        .update(stageRatings)
        .set({ reply: reply.trim(), repliedByUserId: actor.userId, repliedAt: new Date() })
        .where(eq(stageRatings.id, id));
      await notify(
        tx,
        { customerId: rating.customerId },
        {
          kind: 'stage_rating_reply',
          title:
            localAlertTitle('stage_rating_reply', rating.language) ??
            'OneOhm replied to your feedback',
          body: reply.trim().slice(0, 200),
          dedupeKey: `stage_rating_reply:${id}:${Date.now()}`,
        },
      );
      await recordAudit(tx, actor.userId, 'stage_rating.replied', 'stage_rating', id);
    });
    const [updated] = await readStageRatings(this.db, eq(stageRatings.id, id));
    if (!updated) throw notFound('That rating');
    return updated;
  }
}
