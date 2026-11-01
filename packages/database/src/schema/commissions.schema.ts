import { COMMISSION_BASES } from '@oneohm/domain';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { calendarDate, createdAt, instant, money, primaryId, updatedAt, version } from './columns';
import { leads } from './crm.schema';
import { paymentMethodEnum } from './enums';
import { users } from './identity.schema';
import { projects } from './projects.schema';
import { incentiveStatusEnum, qualifyingEventEnum } from './referrals.schema';

export const commissionBasisEnum = pgEnum('commission_basis', COMMISSION_BASES);

/**
 * How a reseller earns commission (PRD 4.8): a percent of the project value or an amount
 * per kW, on a qualifying event. The row without a reseller is the default for everyone.
 */
export const commissionRules = pgTable(
  'commission_rules',
  {
    id: primaryId(),
    resellerUserId: uuid('reseller_user_id').references(() => users.id, { onDelete: 'cascade' }),
    basis: commissionBasisEnum('basis').notNull().default('percent'),
    rateBp: integer('rate_bp').notNull().default(0),
    perKwPaise: money('per_kw_paise').notNull().default(0),
    qualifyingEvent: qualifyingEventEnum('qualifying_event').notNull().default('advance_paid'),
    active: boolean('active').notNull().default(true),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('commission_rules_reseller_unique').on(table.resellerUserId).nullsNotDistinct(),
  ],
);

/**
 * Commission on one project a reseller sold, earned when the project reached the rule's
 * event. Approval books the cost and what is owed; payment records how it was paid.
 */
export const commissionEntries = pgTable(
  'commission_entries',
  {
    id: primaryId(),
    resellerUserId: uuid('reseller_user_id')
      .notNull()
      .references(() => users.id),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    status: incentiveStatusEnum('status').notNull().default('pending'),
    amountPaise: money('amount_paise').notNull(),
    basis: commissionBasisEnum('basis').notNull(),
    rateBp: integer('rate_bp').notNull(),
    perKwPaise: money('per_kw_paise').notNull(),
    projectValuePaise: money('project_value_paise').notNull(),
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
    uniqueIndex('commission_entries_project_unique').on(table.projectId),
    index('commission_entries_reseller_idx').on(table.resellerUserId),
    index('commission_entries_status_idx').on(table.status),
  ],
);
