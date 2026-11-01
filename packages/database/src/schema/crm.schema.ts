import { boolean, doublePrecision, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { discoms } from './catalog.schema';
import { calendarDate, createdAt, instant, primaryId, updatedAt, version } from './columns';
import {
  customerKindEnum,
  leadActivityKindEnum,
  leadSourceEnum,
  leadStageEnum,
  phaseEnum,
  subsidyCategoryEnum,
} from './enums';
import { users } from './identity.schema';
import { leadSteps } from './lead-steps.schema';

/** One customer identity across leads, quotations, projects and service (PRD 3.2). */
export const customers = pgTable(
  'customers',
  {
    id: primaryId(),
    kind: customerKindEnum('kind').notNull().default('individual'),
    name: text('name').notNull(),
    phoneE164: text('phone_e164').notNull(),
    email: text('email'),
    /** The customer's GSTIN, for businesses and societies that have one (printed on invoices). */
    gstin: text('gstin'),
    whatsappOptIn: boolean('whatsapp_opt_in').notNull().default(true),
    preferredLanguage: text('preferred_language').notNull().default('en-IN'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('customers_phone_idx').on(table.phoneE164)],
);

/** A site that gets a system. A customer can have several (PRD 3.2). */
export const properties = pgTable(
  'properties',
  {
    id: primaryId(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    addressLine: text('address_line').notNull(),
    city: text('city').notNull(),
    district: text('district').notNull(),
    state: text('state').notNull().default('Maharashtra'),
    pincode: text('pincode'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    subsidyCategory: subsidyCategoryEnum('subsidy_category').notNull().default('individual'),
    households: integer('households'),
    discomId: uuid('discom_id').references(() => discoms.id),
    consumerNumber: text('consumer_number'),
    meterHolderName: text('meter_holder_name'),
    sanctionedLoadW: integer('sanctioned_load_w'),
    phase: phaseEnum('phase'),
    meterInSocietyName: boolean('meter_in_society_name'),
    subsidyClaimed: boolean('subsidy_claimed').notNull().default(false),
    floors: integer('floors').notNull().default(1),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('properties_customer_idx').on(table.customerId)],
);

/** Every lead has an owner and a next action (PRD 3.3). */
export const leads = pgTable(
  'leads',
  {
    id: primaryId(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    phoneE164: text('phone_e164').notNull(),
    email: text('email'),
    city: text('city').notNull(),
    source: leadSourceEnum('source').notNull().default('manual'),
    /** Set when an existing customer referred this lead from the customer app. */
    referredByCustomerId: uuid('referred_by_customer_id').references(() => customers.id, {
      onDelete: 'set null',
    }),
    stage: leadStageEnum('stage').notNull().default('new'),
    /** The owner's pipeline step inside the stage; null means the stage's first step. */
    stepKey: text('step_key').references(() => leadSteps.key, { onDelete: 'set null' }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    resellerUserId: uuid('reseller_user_id').references(() => users.id, { onDelete: 'set null' }),
    estimatedWp: integer('estimated_wp'),
    subsidyCategory: subsidyCategoryEnum('subsidy_category').notNull().default('individual'),
    nextActionOn: calendarDate('next_action_on'),
    nextActionNote: text('next_action_note'),
    lostReason: text('lost_reason'),
    notes: text('notes'),
    wonAt: instant('won_at'),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('leads_stage_idx').on(table.stage),
    index('leads_owner_idx').on(table.ownerUserId),
    index('leads_phone_idx').on(table.phoneE164),
  ],
);

export const leadActivities = pgTable(
  'lead_activities',
  {
    id: primaryId(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    kind: leadActivityKindEnum('kind').notNull(),
    note: text('note').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [index('lead_activities_lead_idx').on(table.leadId)],
);
