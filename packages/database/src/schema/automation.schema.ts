import { boolean, index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant, primaryId, updatedAt } from './columns';
import { users } from './identity.schema';

/**
 * Business rules owners change in Settings without a developer (PRD 7.2): reminder
 * timing, assignment rules, approval limits and dashboard settings. One row per area;
 * the value is merged over the shipped defaults when read.
 */
export const businessSettings = pgTable('business_settings', {
  key: text('key', { enum: ['reminders', 'assignment', 'approvals', 'dashboard'] }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: updatedAt(),
});

/**
 * One run of a scheduled or background job (PRD 7.1 "workflow history and failure
 * visibility"). A queued row is a retry someone asked for; the worker picks it up.
 */
export const jobRuns = pgTable(
  'job_runs',
  {
    id: primaryId(),
    name: text('name').notNull(),
    trigger: text('trigger', { enum: ['schedule', 'background', 'retry'] })
      .notNull()
      .default('schedule'),
    status: text('status', { enum: ['queued', 'running', 'succeeded', 'failed'] }).notNull(),
    startedAt: instant('started_at'),
    finishedAt: instant('finished_at'),
    /** What it did, in a few words ("12 reminders queued"). */
    result: text('result'),
    error: text('error'),
    /** The failed run a retry repeats; for message delivery, the message's outbox id. */
    retryOfId: uuid('retry_of_id'),
    subjectId: uuid('subject_id'),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (table) => [
    index('job_runs_name_created_idx').on(table.name, table.createdAt),
    index('job_runs_status_idx').on(table.status),
  ],
);

/**
 * The kinds of project OneOhm builds (PRD 7.2 "project types"), named and described by
 * the owner and switched off when not offered. Keys follow the domain's fixed list.
 */
export const projectVariants = pgTable('project_variants', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  active: boolean('active').notNull().default(true),
  position: integer('position').notNull(),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: updatedAt(),
});
