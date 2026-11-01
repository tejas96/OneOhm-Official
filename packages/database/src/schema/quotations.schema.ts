import {
  type AnyPgColumn,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { products } from './catalog.schema';
import { calendarDate, createdAt, instant, money, primaryId, updatedAt, version } from './columns';
import { customers, leads, properties } from './crm.schema';
import {
  productCategoryEnum,
  quantityBasisEnum,
  quotationStatusEnum,
  structureTypeEnum,
  subsidyCategoryEnum,
  systemTypeEnum,
} from './enums';
import { users } from './identity.schema';

/**
 * A quotation revision. Price and subsidy are snapshotted when saved, so later rate or
 * rule changes never alter it (PRD 3.5, 3.9). Accepted revisions are locked.
 */
export const quotations = pgTable(
  'quotations',
  {
    id: primaryId(),
    number: text('number').notNull(),
    revision: integer('revision').notNull().default(1),
    previousQuotationId: uuid('previous_quotation_id').references((): AnyPgColumn => quotations.id),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id),
    status: quotationStatusEnum('status').notNull().default('draft'),
    subsidyCategory: subsidyCategoryEnum('subsidy_category').notNull(),
    systemType: systemTypeEnum('system_type').notNull().default('on_grid'),
    targetWp: integer('target_wp').notNull(),
    capacityWp: integer('capacity_wp').notNull(),
    moduleCount: integer('module_count').notNull(),
    panelProductId: uuid('panel_product_id')
      .notNull()
      .references(() => products.id),
    inverterProductId: uuid('inverter_product_id')
      .notNull()
      .references(() => products.id),
    batteryProductId: uuid('battery_product_id').references(() => products.id),
    structureType: structureTypeEnum('structure_type').notNull(),
    floors: integer('floors').notNull(),
    distanceKm: integer('distance_km').notNull().default(0),
    dcCableMeters: doublePrecision('dc_cable_meters'),
    acCableMeters: doublePrecision('ac_cable_meters'),
    contingencyBp: integer('contingency_bp').notNull(),
    toleranceBp: integer('tolerance_bp').notNull(),
    discountPaise: money('discount_paise').notNull().default(0),
    discountApprovedByUserId: uuid('discount_approved_by_user_id').references(() => users.id),
    subtotalPaise: money('subtotal_paise').notNull(),
    contingencyPaise: money('contingency_paise').notNull(),
    taxPaise: money('tax_paise').notNull(),
    totalPaise: money('total_paise').notNull(),
    costPaise: money('cost_paise').notNull(),
    marginPaise: money('margin_paise').notNull(),
    subsidyPaise: money('subsidy_paise').notNull(),
    subsidyIneligible: text('subsidy_ineligible'),
    effectivePaise: money('effective_paise').notNull(),
    /** Rates and subsidy rule used, kept so the price can always be explained. */
    snapshot: jsonb('snapshot').notNull(),
    validUntil: calendarDate('valid_until').notNull(),
    sentAt: instant('sent_at'),
    acceptedAt: instant('accepted_at'),
    rejectedAt: instant('rejected_at'),
    /** What the customer said when turning it down (PRD 3.5 rejection tracking). */
    rejectionReason: text('rejection_reason'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('quotations_number_revision_unique').on(table.number, table.revision),
    index('quotations_customer_idx').on(table.customerId),
    index('quotations_lead_idx').on(table.leadId),
  ],
);

export const quotationLines = pgTable(
  'quotation_lines',
  {
    id: primaryId(),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => quotations.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    key: text('key').notNull(),
    description: text('description').notNull(),
    category: productCategoryEnum('category').notNull(),
    quantity: doublePrecision('quantity').notNull(),
    unit: text('unit').notNull(),
    unitPricePaise: money('unit_price_paise').notNull(),
    unitCostPaise: money('unit_cost_paise').notNull(),
    taxRateBp: integer('tax_rate_bp').notNull(),
    basis: quantityBasisEnum('basis').notNull(),
    amountPaise: money('amount_paise').notNull(),
    contingencyPaise: money('contingency_paise').notNull(),
    discountPaise: money('discount_paise').notNull(),
    taxPaise: money('tax_paise').notNull(),
    totalPaise: money('total_paise').notNull(),
    costPaise: money('cost_paise').notNull(),
    /** Lines added by hand: optional, gift, charge or adjustment; null for the engine's own. */
    extraKind: text('extra_kind'),
    /** Why a hand-added line is there (PRD 3.9 manual adjustment with reason). */
    reason: text('reason'),
    /** The catalog product an optional item or gift was picked from, if any. */
    productId: uuid('product_id').references(() => products.id),
  },
  (table) => [index('quotation_lines_quotation_idx').on(table.quotationId)],
);
