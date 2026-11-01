import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant, primaryId, updatedAt } from './columns';
import { users } from './identity.schema';
import { projects } from './projects.schema';
import { quotations } from './quotations.schema';

/**
 * A scope or product change on a live project (PRD 3.6, 3.15): what is asked, its impact
 * as shown before approval, and the revision of the accepted quotation that carries it
 * to the customer. Accepting that revision applies the change; rejecting or withdrawing
 * it leaves the project as it was.
 */
export const projectChanges = pgTable(
  'project_changes',
  {
    id: primaryId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** 1, 2, 3… within the project. */
    number: integer('number').notNull(),
    /** raised, approved, accepted, rejected or withdrawn. */
    status: text('status').notNull().default('raised'),
    /** What changes: capacity, battery_added, panel… */
    kinds: text('kinds').array().notNull(),
    reason: text('reason').notNull(),
    /** The accepted quotation's choices with the change applied (a quotation input). */
    input: jsonb('input').notNull(),
    /** Price, subsidy, timeline and material impact, as shown when raised or approved. */
    impact: jsonb('impact').notNull(),
    /** The accepted quotation it changes. */
    fromQuotationId: uuid('from_quotation_id')
      .notNull()
      .references(() => quotations.id),
    /** The revision drafted on approval; the customer accepts or rejects it. */
    quotationId: uuid('quotation_id').references(() => quotations.id),
    raisedByUserId: uuid('raised_by_user_id').references(() => users.id),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    approvedAt: instant('approved_at'),
    closedByUserId: uuid('closed_by_user_id').references(() => users.id),
    closedAt: instant('closed_at'),
    /** Why it was rejected or withdrawn. */
    closeReason: text('close_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('project_changes_project_idx').on(table.projectId),
    uniqueIndex('project_changes_project_number_unique').on(table.projectId, table.number),
  ],
);
