import { index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant, primaryId } from './columns';
import { customers } from './crm.schema';

/**
 * Family members or contacts the customer lets into their app (PRD 5.1). They sign in
 * with their own mobile and see the same projects; only the customer can add or remove
 * them, and WhatsApp messages still go to the customer's own number.
 */
export const customerContacts = pgTable(
  'customer_contacts',
  {
    id: primaryId(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    phoneE164: text('phone_e164').notNull(),
    relation: text('relation').notNull().default(''),
    revokedAt: instant('revoked_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('customer_contacts_customer_phone_unique').on(table.customerId, table.phoneE164),
    index('customer_contacts_phone_idx').on(table.phoneE164),
  ],
);
