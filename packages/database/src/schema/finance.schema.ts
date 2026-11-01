import { index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
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

/** Money received, allocated to a milestone. Never edited; mistakes are reversed. */
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
  },
  (table) => [index('payments_project_idx').on(table.projectId)],
);

/** What OneOhm owes vendors and contractor crews (PRD 3.10, 3.13). */
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
  },
  (table) => [index('payables_due_idx').on(table.dueOn)],
);
