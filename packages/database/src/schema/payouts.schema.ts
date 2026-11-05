import { PAYOUT_STATUSES } from '@oneohm/domain';
import { sql } from 'drizzle-orm';
import { boolean, index, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { calendarDate, createdAt, instant, money, primaryId, updatedAt } from './columns';
import { paymentMethodEnum } from './enums';
import { payables } from './finance.schema';
import { users } from './identity.schema';

export const payoutStatusEnum = pgEnum('payout_status', PAYOUT_STATUSES);

/**
 * Someone who may record payments but not approve them asks an approver to send a bank
 * transfer for an approved bill. One open request per bill. It ends when the money is sent,
 * the asker takes it back, or an approver declines it (with a note).
 */
export const payoutRequests = pgTable(
  'payout_requests',
  {
    id: primaryId(),
    payableId: uuid('payable_id')
      .notNull()
      .references(() => payables.id),
    amountPaise: money('amount_paise').notNull(),
    status: text('status', { enum: ['open', 'sent', 'withdrawn', 'declined'] })
      .notNull()
      .default('open'),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decisionNote: text('decision_note'),
    decidedAt: instant('decided_at'),
    createdAt: createdAt(),
  },
  (table) => [
    index('payout_requests_payable_idx').on(table.payableId),
    uniqueIndex('payout_requests_one_open')
      .on(table.payableId)
      .where(sql`${table.status} = 'open'`),
  ],
);

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
    /** The GST inside the fee (the fee already includes it). */
    feeTaxPaise: money('fee_tax_paise').notNull().default(0),
    status: payoutStatusEnum('status').notNull().default('queued'),
    utr: text('utr'),
    failureReason: text('failure_reason'),
    /** A short machine code for why it failed, for example `low_balance` or `not_reached`. */
    failureCode: text('failure_code'),
    /** When OneOhm last asked RazorpayX about this payout. */
    lastCheckedAt: instant('last_checked_at'),
    /** Set once the "taking longer than usual" alert has gone out. */
    stuckAlertedAt: instant('stuck_alerted_at'),
    accountMasked: text('account_masked').notNull(),
    /** The day the money reached the payee (set when it is processed). */
    paidOn: calendarDate('paid_on'),
    /** Whether the payee was told by WhatsApp: sent, off (switch) or no_phone. Null until paid. */
    payeeTold: text('payee_told'),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** The "ask to send" request this payout answers, if there was one. */
    payoutRequestId: uuid('payout_request_id').references(() => payoutRequests.id),
    /** Who asked to send it (kept here so the two-person check and audit can see it). */
    askedByUserId: uuid('asked_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('bank_payouts_payable_idx').on(table.payableId),
    uniqueIndex('bank_payouts_provider_unique').on(table.providerPayoutId),
    // One transfer on its way per bill: a double click can never send money twice.
    uniqueIndex('bank_payouts_one_open')
      .on(table.payableId)
      .where(sql`${table.status} in ('queued', 'pending', 'processing')`),
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

/**
 * One payment against a bill: all of it, or a part. A bill is paid when its payments add
 * up to what is to pay. Never edited: a mistake or a returned bank transfer marks the row
 * reversed (with the reason), and its ledger entry is reversed with it.
 */
export const payablePayments = pgTable(
  'payable_payments',
  {
    id: primaryId(),
    payableId: uuid('payable_id')
      .notNull()
      .references(() => payables.id),
    amountPaise: money('amount_paise').notNull(),
    method: paymentMethodEnum('method').notNull(),
    paidOn: calendarDate('paid_on').notNull(),
    reference: text('reference'),
    /** The bank transfer that made this payment. Unique, so a payout settles at most once. */
    bankPayoutId: uuid('bank_payout_id').references(() => bankPayouts.id),
    paidByUserId: uuid('paid_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    reversedAt: instant('reversed_at'),
    reversalReason: text('reversal_reason'),
    /**
     * Made from a bill that was already paid when part payments began. Its money is booked
     * under the bill's own "bill paid" entry, so a ledger rebuild books it the old way.
     */
    fromOldBill: boolean('from_old_bill').notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    index('payable_payments_payable_idx').on(table.payableId),
    uniqueIndex('payable_payments_payout_unique')
      .on(table.bankPayoutId)
      .where(sql`${table.bankPayoutId} is not null`),
  ],
);
