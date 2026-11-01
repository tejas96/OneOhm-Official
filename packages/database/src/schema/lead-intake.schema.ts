import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, primaryId } from './columns';
import { leads } from './crm.schema';

/**
 * Every enquiry sent from the website form (PRD 3.3), kept as it arrived. It points to
 * the lead it created or joined, and the rate limit counts these rows.
 */
export const websiteEnquiries = pgTable(
  'website_enquiries',
  {
    id: primaryId(),
    name: text('name').notNull(),
    phoneE164: text('phone_e164').notNull(),
    city: text('city').notNull(),
    message: text('message'),
    /** The page the form was on, as the website sent it. */
    sourcePage: text('source_page'),
    ip: text('ip'),
    /** `created` a new lead, or `existing` when an open lead already had this number. */
    outcome: text('outcome').notNull(),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [
    index('website_enquiries_ip_idx').on(table.ip, table.createdAt),
    index('website_enquiries_phone_idx').on(table.phoneE164, table.createdAt),
  ],
);
