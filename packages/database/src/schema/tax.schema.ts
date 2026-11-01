import { index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { calendarDate, createdAt, money, primaryId, updatedAt } from './columns';
import { users } from './identity.schema';

/**
 * Tax settings finance keeps (PRD 3.11): the TDS rate new contractors and vendor service
 * bills start with, in basis points (100 = 1%). One row; GST details live on the company
 * profile.
 */
export const taxSettings = pgTable('tax_settings', {
  id: text('id').primaryKey().default('default'),
  contractorTdsBp: integer('contractor_tds_bp').notNull().default(100),
  vendorServiceTdsBp: integer('vendor_service_tds_bp').notNull().default(200),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: updatedAt(),
});

/**
 * TDS paid to the government for one month and section, with its challan (PRD 3.11).
 * Booked Dr TDS payable / Cr bank. A month may need more than one deposit when more TDS
 * is held after the first.
 */
export const tdsDeposits = pgTable(
  'tds_deposits',
  {
    id: primaryId(),
    /** The month the TDS was held, as `YYYY-MM`. */
    month: text('month').notNull(),
    /** Income-tax Act section: 194C, 194J or 194Q. */
    section: text('section').notNull(),
    amountPaise: money('amount_paise').notNull(),
    challanNumber: text('challan_number').notNull(),
    depositedOn: calendarDate('deposited_on').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (table) => [index('tds_deposits_month_idx').on(table.month, table.section)],
);
