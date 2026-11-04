import { boolean, index, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant, primaryId, updatedAt } from './columns';
import { customers } from './crm.schema';
import { users } from './identity.schema';
import { projects } from './projects.schema';
import { documents } from './records.schema';

export const documentRequestStatusEnum = pgEnum('document_request_status', [
  'open',
  'received',
  'cancelled',
]);

/**
 * A paper the team asked the customer for (PRD 5.4, 6.1). The customer uploads it in the
 * app; the file lands in the project documents and the request closes.
 */
export const documentRequests = pgTable(
  'document_requests',
  {
    id: primaryId(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    title: text('title').notNull(),
    note: text('note').notNull().default(''),
    status: documentRequestStatusEnum('status').notNull().default('open'),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    receivedAt: instant('received_at'),
    cancelledAt: instant('cancelled_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('document_requests_customer_idx').on(table.customerId, table.status),
    index('document_requests_project_idx').on(table.projectId),
  ],
);

/**
 * Per-report choice: may the customer see it in their app once ready (PRD 3.18)?
 * No row means the report's built-in default.
 */
export const reportSettings = pgTable('report_settings', {
  key: text('key').primaryKey(),
  customerVisible: boolean('customer_visible').notNull(),
  /** Saved to the project's documents by itself when its trigger task finishes (PRD 3.18). */
  autoGenerate: boolean('auto_generate').notNull().default(true),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  updatedAt: updatedAt(),
});
