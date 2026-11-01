import type { WarrantyPolicy } from '@oneohm/domain';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { products } from './catalog.schema';
import { calendarDate, createdAt, instant, money, primaryId, updatedAt } from './columns';
import { customers } from './crm.schema';
import { serviceRequests } from './customer-portal.schema';
import { users } from './identity.schema';
import { projects } from './projects.schema';

/** Kinds of service request with their promised hours (PRD 7.2), editable in Settings. */
export const serviceCategories = pgTable(
  'service_categories',
  {
    id: primaryId(),
    key: text('key').notNull(),
    label: text('label').notNull(),
    customerLabel: text('customer_label').notNull(),
    responseHours: integer('response_hours').notNull(),
    resolutionHours: integer('resolution_hours').notNull(),
    /** Made by OneOhm itself (maintenance visits): customers cannot pick it. */
    system: boolean('system').notNull().default(false),
    active: boolean('active').notNull().default(true),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('service_categories_key_unique').on(table.key)],
);

/** Years of cover per product kind (PRD 3.17). One row, editable in Settings. */
export const warrantyPolicy = pgTable('warranty_policy', {
  id: text('id').primaryKey().default('default'),
  policy: jsonb('policy').$type<WarrantyPolicy>().notNull(),
  updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: updatedAt(),
});

/** What was installed on a commissioned project, with serials and warranty dates. */
export const installedAssets = pgTable(
  'installed_assets',
  {
    id: primaryId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** panel, inverter, battery, structure or workmanship. */
    kind: text('kind').notNull(),
    make: text('make'),
    model: text('model').notNull(),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    quantity: integer('quantity').notNull().default(1),
    serialNumbers: text('serial_numbers').array().notNull().default([]),
    warrantyStartsOn: calendarDate('warranty_starts_on').notNull(),
    warrantyEndsOn: calendarDate('warranty_ends_on').notNull(),
    performanceEndsOn: calendarDate('performance_ends_on'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('installed_assets_project_kind_unique').on(table.projectId, table.kind)],
);

/** Annual maintenance plans the company sells (PRD 3.17), set up in Settings. */
export const amcPlans = pgTable('amc_plans', {
  id: primaryId(),
  name: text('name').notNull(),
  pricePaise: money('price_paise').notNull(),
  visitsPerYear: integer('visits_per_year').notNull(),
  durationMonths: integer('duration_months').notNull(),
  /** What the customer calls a visit: "cleaning" in "Your free cleaning visit". */
  visitName: text('visit_name').notNull(),
  includes: text('includes').array().notNull().default([]),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** An AMC sold for one project. The plan's terms are copied, so later edits never change it. */
export const amcContracts = pgTable(
  'amc_contracts',
  {
    id: primaryId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => amcPlans.id),
    planName: text('plan_name').notNull(),
    visitName: text('visit_name').notNull(),
    includes: text('includes').array().notNull().default([]),
    visitsPerYear: integer('visits_per_year').notNull(),
    startsOn: calendarDate('starts_on').notNull(),
    endsOn: calendarDate('ends_on').notNull(),
    pricePaise: money('price_paise').notNull(),
    note: text('note'),
    soldByUserId: uuid('sold_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    cancelledAt: instant('cancelled_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('amc_contracts_project_idx').on(table.projectId)],
);

/** Preventive visits planned across an AMC; each becomes a service request a week ahead. */
export const amcVisits = pgTable(
  'amc_visits',
  {
    id: primaryId(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => amcContracts.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    dueOn: calendarDate('due_on').notNull(),
    serviceRequestId: uuid('service_request_id').references(() => serviceRequests.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('amc_visits_contract_position_unique').on(table.contractId, table.position),
    index('amc_visits_due_idx').on(table.dueOn),
    index('amc_visits_request_idx').on(table.serviceRequestId),
  ],
);

/** The customer's 1–5 rating of a resolved request (PRD 5.5). One per request. */
export const serviceRatings = pgTable(
  'service_ratings',
  {
    id: primaryId(),
    serviceRequestId: uuid('service_request_id')
      .notNull()
      .references(() => serviceRequests.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('service_ratings_request_unique').on(table.serviceRequestId)],
);
