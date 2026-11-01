import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant, updatedAt } from './columns';
import { users } from './identity.schema';
import { leaveRequests } from './workforce.schema';

/**
 * Who a person reports to (PRD 3.12), set on the Team page. Optional: a person without a
 * row has no manager and everything works as before.
 */
export const reportingLines = pgTable(
  'reporting_lines',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    managerUserId: uuid('manager_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('reporting_lines_manager_idx').on(table.managerUserId),
    check('reporting_lines_not_self', sql`${table.userId} <> ${table.managerUserId}`),
  ],
);

/**
 * A leave request's first look by the person's manager (PRD 4.6), before the leave
 * approvers decide. The manager is fixed when the request is made; agreeing passes it
 * on to the approvers, declining closes it.
 */
export const leaveManagerReviews = pgTable(
  'leave_manager_reviews',
  {
    leaveRequestId: uuid('leave_request_id')
      .primaryKey()
      .references(() => leaveRequests.id, { onDelete: 'cascade' }),
    managerUserId: uuid('manager_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    state: text('state', { enum: ['waiting', 'agreed', 'declined'] })
      .notNull()
      .default('waiting'),
    note: text('note'),
    decidedAt: instant('decided_at'),
    createdAt: createdAt(),
  },
  (table) => [index('leave_manager_reviews_manager_idx').on(table.managerUserId, table.state)],
);
