import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, instant, primaryId, updatedAt } from './columns';
import { customers, leads, properties } from './crm.schema';
import { users } from './identity.schema';
import { projects, projectTasks } from './projects.schema';
import { documents } from './records.schema';

/** What the team asks of the customer. Only `paper` has a flow so far; the rest come later. */
export const customerActionTypeEnum = pgEnum('customer_action_type', [
  'paper',
  'location',
  'self_survey',
  'visit_pick',
  'presence',
  'signature',
  'pay',
  'confirm',
  'rating',
  'payout',
  'callback',
]);

/**
 * `open` waits on the customer; `received` is done by the customer and waits for the
 * team's check; `closed` is finished. A type with no check goes open → closed.
 */
export const customerActionStatusEnum = pgEnum('customer_action_status', [
  'open',
  'received',
  'closed',
  'cancelled',
]);

/**
 * One thing the team asked the customer to do (redesign §2). For a paper (PRD 5.4, 6.1) the
 * customer sends it in the app or on WhatsApp; the file lands in the documents, and the
 * team checks it. Audit rows: entity `customer_action`, actions `customer_action.*`; rows
 * from before this table (entity `document_request`) keep their old names.
 */
export const customerActions = pgTable(
  'customer_actions',
  {
    id: primaryId(),
    type: customerActionTypeEnum('type').notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    /** The home it is about. A person's paper keeps the home it was asked on. */
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
    taskId: uuid('task_id').references(() => projectTasks.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    /** The checklist item a paper answers; null for a free ask and for older rows. */
    requirementKey: text('requirement_key'),
    /** A paper's kind (folder). */
    category: text('category'),
    note: text('note').notNull().default(''),
    /** The latest "ask again" reason the customer sees. */
    reason: text('reason').notNull().default(''),
    status: customerActionStatusEnum('status').notNull().default('open'),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    /** What only one type needs (a date, a place); `{}` for a paper. */
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** When the customer did it. */
    doneAt: instant('done_at'),
    closedAt: instant('closed_at'),
    cancelledAt: instant('cancelled_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('customer_actions_customer_idx').on(table.customerId, table.status),
    index('customer_actions_project_idx').on(table.projectId),
    index('customer_actions_lead_idx').on(table.leadId),
    index('customer_actions_task_idx').on(table.taskId),
    index('customer_actions_status_type_idx').on(table.status, table.type),
    // Asks that must exist once (a payout per reward, a rating per stage or problem, a renewal per
    // AMC) name themselves in `payload.once`; a cancelled one frees the name.
    uniqueIndex('customer_actions_once_unique')
      .on(sql`(${table.payload}->>'once')`)
      .where(sql`${table.payload}->>'once' is not null and ${table.status} <> 'cancelled'`),
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
