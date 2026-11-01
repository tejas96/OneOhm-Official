import { boolean, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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
    /** HSN (goods) or SAC (services) code printed on tax invoices, when known. */
    hsnSac: text('hsn_sac'),
    /** Specifications printed on quotations (PRD 3.5): panel efficiency in basis points. */
    efficiencyBp: integer('efficiency_bp'),
    /** For example Mono PERC bifacial, TOPCon, string inverter, LiFePO4. */
    technology: text('technology'),
    warrantyYears: integer('warranty_years'),
    /** The maker's datasheet, a document filed under `product_datasheet`. */
    datasheetDocumentId: uuid('datasheet_document_id'),
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
    /** What the task is, for the person doing it; copied onto each project task. */
    description: text('description'),
    stage: epcStageEnum('stage').notNull(),
    roleKey: text('role_key').notNull(),
    /** A skill the assignee should have; people in the role without it are the fallback. */
    skillKey: text('skill_key'),
    /** Its own checklist lines ({ key, label }); null uses the built-in list (PRD 4.4). */
    checklist: jsonb('checklist').$type<{ key: string; label: string }[]>(),
    offsetDays: integer('offset_days').notNull().default(0),
    durationDays: integer('duration_days').notNull().default(1),
    dependsOn: text('depends_on').array().notNull(),
    conditions: jsonb('conditions'),
    waitingParty: waitingPartyEnum('waiting_party').notNull().default('internal'),
    customerVisible: boolean('customer_visible').notNull().default(false),
    notifyCustomer: boolean('notify_customer').notNull().default(false),
    approval: boolean('approval').notNull().default(false),
    /** Who approves: approvers (anyone with tasks.approve) or project_manager. */
    reviewer: text('reviewer').notNull().default('approvers'),
    evidence: text('evidence').array().notNull(),
    captures: text('captures').array().notNull(),
    onComplete: text('on_complete'),
    reports: text('reports').array().notNull(),
    /** When the customer message goes: started, completed or approved (PRD 6.2). */
    notifyEvent: text('notify_event').notNull().default('completed'),
    /** The WhatsApp template used for the customer message. */
    messageKey: text('message_key').notNull().default('project_milestone'),
    /** The words customers see for this step; staff see `title`. */
    customerTitle: text('customer_title'),
    /** Who hears the customer message: `customer`, or `customer_and_family` (PRD 6.2). */
    recipients: text('recipients').notNull().default('customer'),
    /** A report or paper link the customer message carries: `report:<key>` or `document:<folder>`. */
    attachment: text('attachment'),
    /** Tell the project manager when this task is done (PRD 3.7 employee notification). */
    notifyManager: boolean('notify_manager').notNull().default(false),
    /** Critical work: the engine proposes someone and a manager confirms (PRD 3.8). */
    confirmAssignee: boolean('confirm_assignee').notNull().default(false),
    /** Days late before the manager hears; null uses the company setting (PRD 3.7). */
    escalateAfterDays: integer('escalate_after_days'),
    position: integer('position').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('task_templates_key_unique').on(table.key)],
);
