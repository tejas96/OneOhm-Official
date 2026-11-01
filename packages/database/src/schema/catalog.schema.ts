import { boolean, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { calendarDate, createdAt, money, primaryId, updatedAt } from './columns';
import { epcStageEnum, productCategoryEnum, subsidyCategoryEnum, waitingPartyEnum } from './enums';

/** Central product catalog; every panel is tagged DCR or non-DCR (PRD 3.5, 3.10). */
export const products = pgTable(
  'products',
  {
    id: primaryId(),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    brand: text('brand').notNull(),
    category: productCategoryEnum('category').notNull(),
    unit: text('unit').notNull().default('nos'),
    wattageWp: integer('wattage_wp'),
    /** Inverters and batteries: rated output in watts. */
    ratedW: integer('rated_w'),
    dcr: boolean('dcr').notNull().default(false),
    pricePaise: money('price_paise').notNull(),
    costPaise: money('cost_paise').notNull(),
    taxRateBp: integer('tax_rate_bp').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('products_sku_unique').on(table.sku)],
);

/** DISCOM master: each DISCOM has its own task set and report formats (PRD 3.16). */
export const discoms = pgTable(
  'discoms',
  {
    id: primaryId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    state: text('state').notNull(),
    expectedDays: integer('expected_days').notNull().default(30),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('discoms_code_unique').on(table.code)],
);

/** Subsidy rule table with valid-from dates; changes need no developer (PRD 3.5). */
export const subsidyRules = pgTable('subsidy_rules', {
  id: primaryId(),
  category: subsidyCategoryEnum('category').notNull(),
  validFrom: calendarDate('valid_from').notNull(),
  slabs: jsonb('slabs').notNull(),
  capPaise: money('cap_paise').notNull(),
  perHouseholdWp: integer('per_household_wp'),
  maxEligibleWp: integer('max_eligible_wp'),
  createdAt: createdAt(),
});

/** Task templates (PRD 3.7), seeded from the domain library and editable. */
export const taskTemplates = pgTable(
  'task_templates',
  {
    id: primaryId(),
    key: text('key').notNull(),
    title: text('title').notNull(),
    stage: epcStageEnum('stage').notNull(),
    roleKey: text('role_key').notNull(),
    offsetDays: integer('offset_days').notNull().default(0),
    durationDays: integer('duration_days').notNull().default(1),
    dependsOn: text('depends_on').array().notNull(),
    conditions: jsonb('conditions'),
    waitingParty: waitingPartyEnum('waiting_party').notNull().default('internal'),
    customerVisible: boolean('customer_visible').notNull().default(false),
    notifyCustomer: boolean('notify_customer').notNull().default(false),
    approval: boolean('approval').notNull().default(false),
    evidence: text('evidence').array().notNull(),
    captures: text('captures').array().notNull(),
    onComplete: text('on_complete'),
    reports: text('reports').array().notNull(),
    position: integer('position').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('task_templates_key_unique').on(table.key)],
);
