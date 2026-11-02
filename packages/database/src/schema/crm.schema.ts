import { LOCATION_SOURCES } from '@oneohm/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { discoms } from './catalog.schema';
import { calendarDate, createdAt, instant, primaryId, updatedAt, version } from './columns';
import {
  contactChannelEnum,
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
    /** WhatsApp first; SMS or in person when they are not on WhatsApp (owner's rule). */
    contactChannel: contactChannelEnum('contact_channel').notNull().default('whatsapp'),
    /** When WhatsApp said this number is not on WhatsApp; messages then go by SMS. */
    whatsappUnreachableAt: instant('whatsapp_unreachable_at'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('customers_phone_idx').on(table.phoneE164)],
);

/** How a property's saved location was set: phone GPS, a dropped map pin, a searched address, or typed. */
export const locationSourceEnum = pgEnum('location_source', LOCATION_SOURCES);

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
    /** How the point above was set; empty for sites with no point. */
    locationSource: locationSourceEnum('location_source'),
    /** The phone's own accuracy reading when the point was set, in metres. */
    locationAccuracyM: integer('location_accuracy_m'),
    locatedAt: instant('located_at'),
    locatedByUserId: uuid('located_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Set when a dropped pin sat far from the phone's reading; staff review it. */
    locationFlagged: boolean('location_flagged').notNull().default(false),
    locationFlagDistanceM: integer('location_flag_distance_m'),
    /** The point before the latest change, so a wrong move can be undone. */
    previousLatitude: doublePrecision('previous_latitude'),
    previousLongitude: doublePrecision('previous_longitude'),
    subsidyCategory: subsidyCategoryEnum('subsidy_category').notNull().default('individual'),
    households: integer('households'),
    discomId: uuid('discom_id').references(() => discoms.id),
    consumerNumber: text('consumer_number'),
    meterHolderName: text('meter_holder_name'),
    sanctionedLoadW: integer('sanctioned_load_w'),
    phase: phaseEnum('phase'),
    meterInSocietyName: boolean('meter_in_society_name'),
    /** The EV charging meter's number, from a completed New EV meter request (PRD 3.15). */
    evMeterNumber: text('ev_meter_number'),
    subsidyClaimed: boolean('subsidy_claimed').notNull().default(false),
    /** A low-income household: the state top-up may apply (PRD 3.5); proof filed as Income proof. */
    lowIncomeHousehold: boolean('low_income_household').notNull().default(false),
    floors: integer('floors').notNull().default(1),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('properties_customer_idx').on(table.customerId),
    // Each connection has its own number: compared without spaces or dashes, in capitals.
    uniqueIndex('properties_consumer_number_unique')
      .on(sql`upper(regexp_replace(${table.consumerNumber}, '[^A-Za-z0-9]', '', 'g'))`)
      .where(sql`${table.consumerNumber} is not null`),
  ],
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
    /** Optional "HH:MM" on the business clock; the owner is alerted shortly before it. */
    nextActionTime: text('next_action_time'),
    nextActionNote: text('next_action_note'),
    /** One of LEAD_LOST_REASONS; `lost_reason` holds the words (required for "other"). */
    lostReasonKey: text('lost_reason_key'),
    lostReason: text('lost_reason'),
    /** A lost lead worth another try: on this day it shows in the owner's follow-ups. */
    revisitOn: calendarDate('revisit_on'),
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
    // PRD 3.3: every open lead has an owner.
    check(
      'leads_open_has_owner',
      sql`${table.stage} in ('won', 'lost') or ${table.ownerUserId} is not null`,
    ),
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
    /** Staff-only: never shown to the reseller who brought the lead (PRD 4.8). */
    internal: boolean('internal').notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [index('lead_activities_lead_idx').on(table.leadId)],
);
