import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant, primaryId } from './columns';
import { customers } from './crm.schema';
import { users } from './identity.schema';

/**
 * One alert for one person: a staff member or a customer (PRD 3.7, 5.1). It shows in the
 * app's inbox and, when the person allowed it, goes to their phone through the outbox.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: primaryId(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** What the alert is about, so each app can open the right screen. */
    subjectType: text('subject_type'),
    subjectId: uuid('subject_id'),
    projectId: uuid('project_id'),
    dedupeKey: text('dedupe_key').notNull(),
    readAt: instant('read_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('notifications_dedupe_unique').on(table.dedupeKey),
    index('notifications_user_idx').on(table.userId, table.createdAt),
    index('notifications_customer_idx').on(table.customerId, table.createdAt),
    check(
      'notifications_one_recipient',
      sql`(${table.userId} is null) <> (${table.customerId} is null)`,
    ),
  ],
);

/** A phone that asked for alerts. A token the push service rejects is turned off. */
export const pushDevices = pgTable(
  'push_devices',
  {
    id: primaryId(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    platform: text('platform').notNull(),
    app: text('app').notNull(),
    lastSeenAt: instant('last_seen_at').notNull().defaultNow(),
    disabledAt: instant('disabled_at'),
    disabledReason: text('disabled_reason'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('push_devices_token_unique').on(table.token),
    index('push_devices_user_idx').on(table.userId),
    index('push_devices_customer_idx').on(table.customerId),
    check(
      'push_devices_one_owner',
      sql`(${table.userId} is null) <> (${table.customerId} is null)`,
    ),
  ],
);
