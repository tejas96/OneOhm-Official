import { index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant, primaryId } from './columns';
import { waitingPartyEnum } from './enums';
import { users } from './identity.schema';
import { projects, projectTasks } from './projects.schema';
import { documents } from './records.schema';

/**
 * A statutory report handed to the DISCOM or the subsidy portal (PRD 3.18). Once
 * submitted it is never saved again by itself; the fingerprint shows when the data
 * behind it changed afterwards.
 */
export const reportSubmissions = pgTable(
  'report_submissions',
  {
    id: primaryId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    reportKey: text('report_key').notNull(),
    /** The saved copy that was submitted, when there was one. */
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    /** The data's fingerprint when submitted. */
    fingerprint: text('fingerprint').notNull(),
    submittedAt: instant('submitted_at').notNull().defaultNow(),
    submittedByUserId: uuid('submitted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('report_submissions_unique').on(table.projectId, table.reportKey)],
);

/**
 * A finished stretch of waiting on a task (PRD 3.16): kept when the task is resumed, so
 * DISCOM averages count every wait, not only the last one.
 */
export const taskWaits = pgTable(
  'task_waits',
  {
    id: primaryId(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => projectTasks.id, { onDelete: 'cascade' }),
    party: waitingPartyEnum('party').notNull(),
    startedAt: instant('started_at').notNull(),
    endedAt: instant('ended_at').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('task_waits_task_idx').on(table.taskId)],
);
