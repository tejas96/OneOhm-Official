import { INCENTIVE_STATUSES, QUALIFYING_EVENTS, REFERRAL_REWARD_BASES } from '@oneohm/domain';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { calendarDate, createdAt, instant, money, primaryId, updatedAt, version } from './columns';
import { customers, leads } from './crm.schema';
import { paymentMethodEnum, projectTypeEnum } from './enums';
import { users } from './identity.schema';
import { projects } from './projects.schema';

export const qualifyingEventEnum = pgEnum('qualifying_event', QUALIFYING_EVENTS);
export const referralRewardBasisEnum = pgEnum('referral_reward_basis', REFERRAL_REWARD_BASES);
export const incentiveStatusEnum = pgEnum('incentive_status', INCENTIVE_STATUSES);

/**
 * The refer-and-earn programme (PRD 5.6, 7.2): one row the owner edits in Settings.
 * Earned rewards keep their own copy of the terms, so a change never alters them.
 */
export const referralPrograms = pgTable('referral_programs', {
  id: primaryId(),
  active: boolean('active').notNull().default(false),
  basis: referralRewardBasisEnum('basis').notNull().default('per_referral'),
  /** Per referral: the reward. Per kW: the reward for each kW installed. */
  amountPaise: money('amount_paise').notNull().default(0),
  qualifyingEvent: qualifyingEventEnum('qualifying_event').notNull().default('advance_paid'),
  /** Referrals registered from this day count; older ones do not. */
  startsOn: calendarDate('starts_on').notNull(),
  /** Everything the campaign may commit; null is no limit. */
  budgetPaise: money('budget_paise'),
  perCustomerCount: integer('per_customer_count'),
  perCustomerPaise: money('per_customer_paise'),
  /** Project types that earn a reward; empty is every type. */
  eligibleTypes: projectTypeEnum('eligible_types').array().notNull(),
  /** The WhatsApp number friends message with the code; the company phone when null. */
  shareNumberE164: text('share_number_e164'),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  version: version(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Each customer's referral code, made the first time they open Refer and earn. */
export const referralCodes = pgTable(
  'referral_codes',
  {
    customerId: uuid('customer_id')
      .primaryKey()
      .references(() => customers.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('referral_codes_code_unique').on(table.code)],
);

/**
 * A reward for a referred lead whose project reached the qualifying event. One per
 * lead. Pending until finance approves it (booked as a marketing expense), then paid.
 */
export const referralRewards = pgTable(
  'referral_rewards',
  {
    id: primaryId(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    referrerCustomerId: uuid('referrer_customer_id')
      .notNull()
      .references(() => customers.id),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    status: incentiveStatusEnum('status').notNull().default('pending'),
    amountPaise: money('amount_paise').notNull(),
    basis: referralRewardBasisEnum('basis').notNull(),
    ratePaise: money('rate_paise').notNull(),
    capacityWp: integer('capacity_wp').notNull(),
    qualifyingEvent: qualifyingEventEnum('qualifying_event').notNull(),
    earnedAt: instant('earned_at').notNull(),
    approvedAt: instant('approved_at'),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    rejectedAt: instant('rejected_at'),
    rejectedByUserId: uuid('rejected_by_user_id').references(() => users.id),
    rejectReason: text('reject_reason'),
    paidAt: instant('paid_at'),
    paidOn: calendarDate('paid_on'),
    paidMethod: paymentMethodEnum('paid_method'),
    paidReference: text('paid_reference'),
    paidByUserId: uuid('paid_by_user_id').references(() => users.id),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('referral_rewards_lead_unique').on(table.leadId),
    index('referral_rewards_referrer_idx').on(table.referrerCustomerId),
    index('referral_rewards_status_idx').on(table.status),
  ],
);
