import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { calendarDate, createdAt, instant, money, primaryId, updatedAt } from './columns';
import {
  milestoneStatusEnum,
  payablePartyEnum,
  payableStatusEnum,
  payerEnum,
  paymentMethodEnum,
} from './enums';
import { users } from './identity.schema';
import { projects } from './projects.schema';

/**
 * Receivables by milestone, each with a payer (customer or bank) and the event that
 * makes it due (PRD 3.11). The subsidy is never a receivable.
 */
export const paymentMilestones = pgTable(
  'payment_milestones',
  {
    id: primaryId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    payer: payerEnum('payer').notNull(),
    amountPaise: money('amount_paise').notNull(),
    trigger: text('trigger').notNull(),
    status: milestoneStatusEnum('status').notNull().default('upcoming'),
    dueAt: instant('due_at'),
    position: integer('position').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('payment_milestones_project_idx').on(table.projectId)],
);

/**
 * Money received, allocated to a milestone. Never edited: a mistake gets a reversal row
 * (negative amount, pointing at the original), and the ledger entry is reversed with it.
 */
export const payments = pgTable(
  'payments',
  {
    id: primaryId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    milestoneId: uuid('milestone_id').references(() => paymentMilestones.id),
    payer: payerEnum('payer').notNull(),
    method: paymentMethodEnum('method').notNull(),
    amountPaise: money('amount_paise').notNull(),
    receivedOn: calendarDate('received_on').notNull(),
    reference: text('reference'),
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    reversesPaymentId: uuid('reverses_payment_id').references((): AnyPgColumn => payments.id),
    reversalReason: text('reversal_reason'),
    /** Set once when the payment is recorded, e.g. OH/RCPT/2026-27/0001. Reversals have none. */
    receiptNumber: text('receipt_number'),
    /** The gateway's payment ID for online payments: a repeat webhook never records twice. */
    gatewayPaymentId: text('gateway_payment_id'),
    /** What the gateway kept (fee plus GST on it), booked as an expense. */
    gatewayFeePaise: money('gateway_fee_paise'),
    /** The money came out of the customer's credit (an earlier overpayment), not in afresh. */
    paidFromCredit: boolean('paid_from_credit').notNull().default(false),
  },
  (table) => [
    index('payments_project_idx').on(table.projectId),
    uniqueIndex('payments_reversal_unique').on(table.reversesPaymentId),
    uniqueIndex('payments_receipt_number_unique').on(table.receiptNumber),
    uniqueIndex('payments_gateway_payment_unique').on(table.gatewayPaymentId),
  ],
);

/**
 * What OneOhm owes vendors and contractor crews (PRD 3.10, 3.13). Other modules create
 * rows as `pending` with the first block of columns; finance approves (the cost and the
 * liability are posted then) and pays (method, date and reference recorded).
 */
export const payables = pgTable(
  'payables',
  {
    id: primaryId(),
    projectId: uuid('project_id').references(() => projects.id),
    party: payablePartyEnum('party').notNull(),
    partyName: text('party_name').notNull(),
    partyUserId: uuid('party_user_id').references(() => users.id),
    description: text('description').notNull(),
    amountPaise: money('amount_paise').notNull(),
    dueOn: calendarDate('due_on').notNull(),
    status: payableStatusEnum('status').notNull().default('pending'),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    paidAt: instant('paid_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** The vendor's or crew's own bill number, when there is one. */
    billNumber: text('bill_number'),
    approvedAt: instant('approved_at'),
    paidOn: calendarDate('paid_on'),
    paidMethod: paymentMethodEnum('paid_method'),
    paidReference: text('paid_reference'),
    paidByUserId: uuid('paid_by_user_id').references(() => users.id),
  },
  (table) => [index('payables_due_idx').on(table.dueOn)],
);
