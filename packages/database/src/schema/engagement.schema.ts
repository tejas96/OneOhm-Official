import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { calendarDate, createdAt, instant, money, primaryId, updatedAt } from './columns';
import { payables } from './finance.schema';
import { users } from './identity.schema';
import { projects } from './projects.schema';
import { decisionStatusEnum } from './workforce.schema';

/**
 * A short notice from the owners or HR to the team (PRD 4.1): shown on the field app's
 * Today screen until it ends, and sent once as an alert. No email.
 */
export const announcements = pgTable(
  'announcements',
  {
    id: primaryId(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** Role keys it is for; empty means everyone on the staff. */
    audienceRoleKeys: text('audience_role_keys').array().notNull().default(sql`'{}'::text[]`),
    /** Last day it shows; null keeps it until someone takes it down. */
    endsOn: calendarDate('ends_on'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    endedAt: instant('ended_at'),
    createdAt: createdAt(),
  },
  (table) => [index('announcements_created_idx').on(table.createdAt)],
);

/**
 * A bonus or incentive for people's work, usually on one project (PRD 3.12, 4.7).
 * Proposed, then approved by someone who approves payments; approval makes each share a
 * payable to that employee, which finance pays.
 */
export const projectBonuses = pgTable(
  'project_bonuses',
  {
    id: primaryId(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    reason: text('reason').notNull(),
    totalPaise: money('total_paise').notNull(),
    status: decisionStatusEnum('status').notNull().default('pending'),
    proposedByUserId: uuid('proposed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedAt: instant('decided_at'),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('project_bonuses_status_idx').on(table.status)],
);

/** One person's part of a bonus, and the payable it became once approved. */
export const projectBonusShares = pgTable(
  'project_bonus_shares',
  {
    id: primaryId(),
    bonusId: uuid('bonus_id')
      .notNull()
      .references(() => projectBonuses.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    shares: integer('shares').notNull().default(1),
    amountPaise: money('amount_paise').notNull(),
    payableId: uuid('payable_id').references(() => payables.id, { onDelete: 'set null' }),
  },
  (table) => [
    uniqueIndex('project_bonus_shares_unique').on(table.bonusId, table.userId),
    index('project_bonus_shares_user_idx').on(table.userId),
  ],
);

/**
 * One person's own work settings (PRD 3.12, 4.3): an open-task limit over the company
 * default, and location switched on or off for them over their roles and the company.
 */
export const personWorkSettings = pgTable('person_work_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  openTaskLimit: integer('open_task_limit'),
  tracking: text('tracking', { enum: ['on', 'off'] }),
  updatedAt: updatedAt(),
});

/**
 * The phone's battery and connection when a location was read (PRD 4.3), where the
 * phone tells us. Kept beside the reading it came with.
 */
export const readingConditions = pgTable(
  'reading_conditions',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: ['check_in', 'check_out', 'site_check_in', 'site_check_out'],
    }).notNull(),
    /** The attendance day or site visit the reading belongs to. */
    subjectId: uuid('subject_id').notNull(),
    batteryPercent: integer('battery_percent'),
    charging: boolean('charging'),
    network: text('network', { enum: ['wifi', 'cellular', 'none', 'other'] }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('reading_conditions_subject_unique').on(table.subjectId, table.kind)],
);
