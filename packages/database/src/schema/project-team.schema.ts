import { sql } from 'drizzle-orm';
import { index, integer, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant, primaryId, updatedAt } from './columns';
import { contractors } from './contractors.schema';
import { users } from './identity.schema';
import { projects } from './projects.schema';

/**
 * The one contractor (crew company) a project's crew work goes to (PRD 3.8, Flow H):
 * chosen at creation, or picked by the engine when the owner leaves it to the system.
 */
export const projectContractors = pgTable(
  'project_contractors',
  {
    projectId: uuid('project_id')
      .primaryKey()
      .references(() => projects.id, { onDelete: 'cascade' }),
    contractorId: uuid('contractor_id')
      .notNull()
      .references(() => contractors.id),
    /** Who chose it; null when the engine picked it. */
    chosenByUserId: uuid('chosen_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('project_contractors_contractor_idx').on(table.contractorId)],
);

/** People the owner named for a project; its in-house tasks go to them first (PRD 3.8). */
export const projectTeamMembers = pgTable(
  'project_team_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    index('project_team_members_user_idx').on(table.userId),
  ],
);

/**
 * Who managed a project, and when. At most one open term (no end) per project; a change
 * of manager closes it and opens the next, so reports can split by who was in charge.
 */
export const projectManagerTerms = pgTable(
  'project_manager_terms',
  {
    id: primaryId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    startedAt: instant('started_at').notNull(),
    endedAt: instant('ended_at'),
    createdAt: createdAt(),
  },
  (table) => [
    index('project_manager_terms_project_idx').on(table.projectId),
    uniqueIndex('project_manager_terms_open_unique')
      .on(table.projectId)
      .where(sql`${table.endedAt} IS NULL`),
  ],
);

/** When late or stuck work is pushed up (PRD 3.7, 7.2). One row, edited in Settings. */
export const escalationPolicy = pgTable('escalation_policy', {
  id: text('id').primaryKey().default('default'),
  managerAfterDays: integer('manager_after_days').notNull(),
  ownersAfterDays: integer('owners_after_days').notNull(),
  stuckInternalDays: integer('stuck_internal_days').notNull(),
  stuckOutsideDays: integer('stuck_outside_days').notNull(),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: updatedAt(),
});
