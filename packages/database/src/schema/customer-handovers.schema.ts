import { index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant, primaryId } from './columns';
import { customers } from './crm.schema';
import { customerActions } from './customer-actions.schema';
import { users } from './identity.schema';
import { projects } from './projects.schema';

/**
 * News for a customer who is on neither WhatsApp nor SMS: the team shares it in person
 * (prints the paper, calls, or tells them on the next visit) and ticks it off.
 */
export const customerHandovers = pgTable(
  'customer_handovers',
  {
    id: primaryId(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    /** The ask this task is about; ticking the task closes the ask. */
    actionId: uuid('action_id').references(() => customerActions.id, { onDelete: 'set null' }),
    template: text('template').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    doneAt: instant('done_at'),
    doneByUserId: uuid('done_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('customer_handovers_dedupe_unique').on(table.dedupeKey),
    index('customer_handovers_open_idx').on(table.customerId, table.doneAt),
  ],
);
