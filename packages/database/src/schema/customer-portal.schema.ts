import { index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant, primaryId, updatedAt } from './columns';
import { customers } from './crm.schema';
import { users } from './identity.schema';
import { projects } from './projects.schema';

/** Customer app sign-ins (bearer token, hash only), separate from staff sessions. */
export const customerSessions = pgTable(
  'customer_sessions',
  {
    id: primaryId(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: instant('expires_at').notNull(),
    lastSeenAt: instant('last_seen_at'),
    revokedAt: instant('revoked_at'),
    createdAt: createdAt(),
  },
  (table) => [index('customer_sessions_token_idx').on(table.tokenHash)],
);

/** Service and support requests raised by customers (PRD 5.5, 3.17). */
export const serviceRequests = pgTable(
  'service_requests',
  {
    id: primaryId(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    category: text('category').notNull(),
    description: text('description').notNull(),
    status: text('status').notNull().default('open'),
    assigneeUserId: uuid('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
    resolutionNote: text('resolution_note'),
    resolvedAt: instant('resolved_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('service_requests_customer_idx').on(table.customerId)],
);

/** Ratings and comments after handover (PRD 5.7). One per project. */
export const customerFeedback = pgTable(
  'customer_feedback',
  {
    id: primaryId(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: createdAt(),
  },
  (table) => [index('customer_feedback_project_idx').on(table.projectId)],
);
