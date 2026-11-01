import { PAYOUT_STATUSES } from '@oneohm/domain';
import { index, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, money, primaryId, updatedAt } from './columns';
import { payables } from './finance.schema';
import { users } from './identity.schema';

export const payoutStatusEnum = pgEnum('payout_status', PAYOUT_STATUSES);

/**
 * A bank transfer of one approved bill through RazorpayX (PRD 3.11). The bill is marked
 * paid only when Razorpay reports the payout processed (with its UTR).
 */
export const bankPayouts = pgTable(
  'bank_payouts',
  {
    id: primaryId(),
    payableId: uuid('payable_id')
      .notNull()
      .references(() => payables.id),
    provider: text('provider').notNull(),
    providerPayoutId: text('provider_payout_id'),
    fundAccountId: text('fund_account_id').notNull(),
    mode: text('mode').notNull(),
    amountPaise: money('amount_paise').notNull(),
    feePaise: money('fee_paise').notNull().default(0),
    status: payoutStatusEnum('status').notNull().default('queued'),
    utr: text('utr'),
    failureReason: text('failure_reason'),
    accountMasked: text('account_masked').notNull(),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('bank_payouts_payable_idx').on(table.payableId),
    uniqueIndex('bank_payouts_provider_unique').on(table.providerPayoutId),
  ],
);

/**
 * The payee as RazorpayX knows them (a contact and its bank fund account), reused while
 * the bank details stay the same.
 */
export const payoutAccounts = pgTable(
  'payout_accounts',
  {
    id: primaryId(),
    payeeKind: text('payee_kind').notNull(),
    payeeId: uuid('payee_id').notNull(),
    provider: text('provider').notNull(),
    contactId: text('contact_id').notNull(),
    fundAccountId: text('fund_account_id').notNull(),
    /** Name, IFSC and account number as sent; new details make a new fund account. */
    fingerprint: text('fingerprint').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('payout_accounts_payee_unique').on(
      table.payeeKind,
      table.payeeId,
      table.provider,
      table.fingerprint,
    ),
  ],
);
