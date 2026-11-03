import { boolean, pgTable, text } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './columns';

/**
 * The owner's list of ad and campaign codes, edited in Settings → Selling → Ad and campaign
 * codes. A code (uppercase, for example DIWALI-26) is what an ad link or a WhatsApp opening
 * line carries, so a lead can say which campaign brought it.
 */
export const leadCampaigns = pgTable('lead_campaigns', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
