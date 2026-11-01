import { LEDGER_ACCOUNT_TYPES } from '@oneohm/domain';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { calendarDate, createdAt, money, primaryId } from './columns';
import { users } from './identity.schema';
import { projects } from './projects.schema';

export const ledgerAccountTypeEnum = pgEnum('ledger_account_type', LEDGER_ACCOUNT_TYPES);

/** What caused a journal entry. With the source ID it makes every posting happen once. */
export const journalSourceEnum = pgEnum('journal_source', [
  'milestone_due',
  'advance_applied',
  'payment',
  'payable_approved',
  'payable_paid',
  'work_order_tds',
  'reversal',
  'gateway_fee',
  'settlement',
  'customer_credit',
  'customer_refund',
  'cash_deposit',
  'cheque_cleared',
  'payout_fee',
  'referral_reward_approved',
  'referral_reward_paid',
  'commission_approved',
  'commission_paid',
  'vendor_advance_paid',
  'vendor_advance_adjusted',
]);

/** The chart of accounts (seeded from `LEDGER_ACCOUNTS` in the domain package). */
export const ledgerAccounts = pgTable('ledger_accounts', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  type: ledgerAccountTypeEnum('type').notNull(),
  createdAt: createdAt(),
});

/**
 * A balanced, immutable journal entry (PRD 3.11 "double-entry financial ledger").
 * Entries are never edited or deleted; a mistake gets a reversing entry.
 */
export const journalEntries = pgTable(
  'journal_entries',
  {
    id: primaryId(),
    number: integer('number').generatedAlwaysAsIdentity(),
    entryDate: calendarDate('entry_date').notNull(),
    memo: text('memo').notNull(),
    sourceType: journalSourceEnum('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    projectId: uuid('project_id').references(() => projects.id),
    reversesEntryId: uuid('reverses_entry_id'),
    postedByUserId: uuid('posted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('journal_entries_source_unique').on(table.sourceType, table.sourceId),
    index('journal_entries_date_idx').on(table.entryDate),
    index('journal_entries_project_idx').on(table.projectId),
  ],
);

export const journalLines = pgTable(
  'journal_lines',
  {
    id: primaryId(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => journalEntries.id, { onDelete: 'restrict' }),
    accountCode: text('account_code')
      .notNull()
      .references(() => ledgerAccounts.code),
    debitPaise: money('debit_paise').notNull().default(0),
    creditPaise: money('credit_paise').notNull().default(0),
    position: integer('position').notNull(),
  },
  (table) => [
    index('journal_lines_entry_idx').on(table.entryId),
    index('journal_lines_account_idx').on(table.accountCode),
    check(
      'journal_lines_one_sided',
      sql`(${table.debitPaise} > 0 and ${table.creditPaise} = 0) or (${table.creditPaise} > 0 and ${table.debitPaise} = 0)`,
    ),
  ],
);
