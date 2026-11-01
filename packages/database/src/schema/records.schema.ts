import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant, primaryId } from './columns';
import { customers, properties } from './crm.schema';
import { serviceRequests } from './customer-portal.schema';
import { documentSourceEnum, outboxChannelEnum, outboxStatusEnum } from './enums';
import { users } from './identity.schema';
import { projects, projectTasks } from './projects.schema';

/** Every document, wherever it came from, linked to its customer and project (PRD 3.14). */
export const documents = pgTable(
  'documents',
  {
    id: primaryId(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => projectTasks.id, { onDelete: 'set null' }),
    category: text('category').notNull(),
    source: documentSourceEnum('source').notNull(),
    name: text('name').notNull(),
    storageKey: text('storage_key').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    reportKey: text('report_key'),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
    /** The earlier file this one replaced; the old row keeps `replacedAt` and who did it. */
    replacesDocumentId: uuid('replaces_document_id'),
    /** When replaced, the old row stays for the audit trail (no visible versioning). */
    replacedAt: instant('replaced_at'),
    replacedByUserId: uuid('replaced_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Taken off a task or project (for example a wrong photo); the file is kept. */
    removedAt: instant('removed_at'),
    removedByUserId: uuid('removed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Photos a customer added to a help request in the app (PRD 5.5). */
    serviceRequestId: uuid('service_request_id').references(() => serviceRequests.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (table) => [
    index('documents_service_request_idx').on(table.serviceRequestId),
    index('documents_project_idx').on(table.projectId),
    index('documents_task_idx').on(table.taskId),
    index('documents_customer_idx').on(table.customerId),
    index('documents_category_idx').on(table.category),
  ],
);

/** Important changes and financial actions, with who did them (PRD 7.3). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: primaryId(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    data: jsonb('data'),
    createdAt: createdAt(),
  },
  (table) => [index('audit_entity_idx').on(table.entity, table.entityId)],
);

/**
 * Messages to send (WhatsApp, SMS, push), written in the same transaction as the change
 * that causes them and delivered by the worker with retries (PRD 6.2).
 */
export const outbox = pgTable(
  'outbox',
  {
    id: primaryId(),
    channel: outboxChannelEnum('channel').notNull(),
    recipient: text('recipient').notNull(),
    template: text('template').notNull(),
    payload: jsonb('payload').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    status: outboxStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    sentAt: instant('sent_at'),
    createdAt: createdAt(),
  },
  (table) => [
    index('outbox_status_idx').on(table.status),
    uniqueIndex('outbox_dedupe_unique').on(table.dedupeKey),
  ],
);
