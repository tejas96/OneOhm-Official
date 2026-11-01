import { index, jsonb, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { calendarDate, createdAt, instant, money, primaryId, updatedAt } from './columns';
import { paymentMilestones } from './finance.schema';
import { users } from './identity.schema';
import { projects } from './projects.schema';

export const paymentLinkStatusEnum = pgEnum('payment_link_status', [
  'created',
  'partly_paid',
  'paid',
  'expired',
  'cancelled',
]);

/**
 * An online payment link for what a customer still owes on one milestone (PRD 3.11, 5.3).
 * `provider` is "razorpay", or "sandbox" for local testing without keys.
 */
export const paymentLinks = pgTable(
  'payment_links',
  {
    id: primaryId(),
    milestoneId: uuid('milestone_id')
      .notNull()
      .references(() => paymentMilestones.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerLinkId: text('provider_link_id').notNull().unique(),
    referenceId: text('reference_id').notNull().unique(),
    url: text('url').notNull(),
    amountPaise: money('amount_paise').notNull(),
    paidPaise: money('paid_paise').notNull().default(0),
    status: paymentLinkStatusEnum('status').notNull().default('created'),
    expiresAt: instant('expires_at'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    paidAt: instant('paid_at'),
    cancelledAt: instant('cancelled_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('payment_links_milestone_idx').on(table.milestoneId)],
);

/** Money the gateway paid into the bank, net of its fees, matched to the ledger. */
export const gatewaySettlements = pgTable('gateway_settlements', {
  id: primaryId(),
  provider: text('provider').notNull(),
  providerSettlementId: text('provider_settlement_id').notNull().unique(),
  amountPaise: money('amount_paise').notNull(),
  feesPaise: money('fees_paise').notNull().default(0),
  taxPaise: money('tax_paise').notNull().default(0),
  utr: text('utr'),
  settledOn: calendarDate('settled_on').notNull(),
  createdAt: createdAt(),
});

/** Every gateway webhook as received, so a repeat delivery is recognised and ignored. */
export const gatewayEvents = pgTable('gateway_events', {
  id: primaryId(),
  provider: text('provider').notNull(),
  eventId: text('event_id').notNull().unique(),
  event: text('event').notNull(),
  payload: jsonb('payload').notNull(),
  outcome: text('outcome'),
  receivedAt: createdAt(),
});
