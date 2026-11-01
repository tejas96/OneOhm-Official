import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant, primaryId } from './columns';
import { users } from './identity.schema';
import { projectTasks } from './projects.schema';

/**
 * Each time finished work goes for approval and what came of it (PRD 3.7, 3.12, 4.4):
 * pending, approved, returned (sent back for correction, with the reason) or
 * self_approved (the doer was the only person who could approve it). The returns per
 * task are its rework count; the latest open return is what the assignee sees.
 */
export const taskReviews = pgTable(
  'task_reviews',
  {
    id: primaryId(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => projectTasks.id, { onDelete: 'cascade' }),
    submittedByUserId: uuid('submitted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    outcome: text('outcome').notNull().default('pending'),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedAt: instant('decided_at'),
    /** Why it was sent back; shown to the assignee until they send it again. */
    note: text('note'),
    createdAt: createdAt(),
  },
  (table) => [index('task_reviews_task_idx').on(table.taskId)],
);
