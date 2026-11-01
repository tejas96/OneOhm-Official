import { index, integer, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant, primaryId } from './columns';
import { customers } from './crm.schema';
import { users } from './identity.schema';
import { projects } from './projects.schema';

/**
 * The customer's rating of one finished stage of their project (PRD 5.7): survey,
 * installation, or switch-on and handover. Once per stage; OneOhm can reply.
 */
export const stageRatings = pgTable(
  'stage_ratings',
  {
    id: primaryId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    stage: text('stage').notNull(),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    reply: text('reply'),
    repliedByUserId: uuid('replied_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    repliedAt: instant('replied_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('stage_ratings_project_stage_unique').on(table.projectId, table.stage),
    index('stage_ratings_customer_idx').on(table.customerId),
  ],
);

/** Optional stars for the people who did that stage's work (staff or crew members). */
export const stageRatingPeople = pgTable(
  'stage_rating_people',
  {
    ratingId: uuid('rating_id')
      .notNull()
      .references(() => stageRatings.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ratingId, table.userId] }),
    index('stage_rating_people_user_idx').on(table.userId),
  ],
);
