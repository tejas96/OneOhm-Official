import { HANDLING_STATUSES } from '@oneohm/domain';
import { index, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { calendarDate, createdAt, money, primaryId, updatedAt } from './columns';
import { payments } from './finance.schema';
import { users } from './identity.schema';

export const handlingStatusEnum = pgEnum('payment_handling_status', HANDLING_STATUSES);

/**
 * A deposit slip: cash and cheques collected for projects, paid into the bank together
 * (PRD 3.11). Cash leaves "Cash in hand" here; cheques move to the bank when they clear.
 */
export const moneyDeposits = pgTable(
  'money_deposits',
  {
    id: primaryId(),
    number: text('number').notNull(),
    depositedOn: calendarDate('deposited_on').notNull(),
    bankReference: text('bank_reference'),
    cashPaise: money('cash_paise').notNull().default(0),
    chequePaise: money('cheque_paise').notNull().default(0),
    note: text('note').notNull().default(''),
    depositedByUserId: uuid('deposited_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('money_deposits_number_unique').on(table.number)],
);

/**
 * Who holds a cash or cheque payment and where it is now: in hand, deposited, cleared
 * or bounced. One row per cash or cheque payment received for a milestone.
 */
export const paymentHandling = pgTable(
  'payment_handling',
  {
    paymentId: uuid('payment_id')
      .primaryKey()
      .references(() => payments.id, { onDelete: 'cascade' }),
    collectedByUserId: uuid('collected_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    chequeNumber: text('cheque_number'),
    chequeBank: text('cheque_bank'),
    chequeDate: calendarDate('cheque_date'),
    status: handlingStatusEnum('status').notNull().default('in_hand'),
    depositId: uuid('deposit_id').references(() => moneyDeposits.id, { onDelete: 'set null' }),
    clearedOn: calendarDate('cleared_on'),
    bouncedOn: calendarDate('bounced_on'),
    bounceReason: text('bounce_reason'),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('payment_handling_status_idx').on(table.status),
    index('payment_handling_deposit_idx').on(table.depositId),
  ],
);
