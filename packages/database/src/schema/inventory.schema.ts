import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { products } from './catalog.schema';
import { createdAt, primaryId, updatedAt } from './columns';
import { users } from './identity.schema';
import { projects } from './projects.schema';

/**
 * Stock by location (PRD 3.10). Quantities are decimals because cable and wire are
 * stocked in metres; serialised items (panels, inverters, batteries) are whole units.
 */
export const stockMovementKindEnum = pgEnum('stock_movement_kind', [
  'receipt',
  'reservation',
  'release',
  'dispatch',
  'adjustment',
]);
export const serialStatusEnum = pgEnum('serial_status', ['in_stock', 'reserved', 'dispatched']);

export const stockLocations = pgTable(
  'stock_locations',
  {
    id: primaryId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    address: text('address'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('stock_locations_code_unique').on(table.code)],
);

export const vendors = pgTable('vendors', {
  id: primaryId(),
  name: text('name').notNull(),
  gstin: text('gstin'),
  contactName: text('contact_name'),
  phoneE164: text('phone_e164'),
  email: text('email'),
  address: text('address'),
  /** Days after the goods receipt that the vendor expects payment. */
  paymentTermsDays: integer('payment_terms_days').notNull().default(30),
  notes: text('notes'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** What each vendor supplies, for picking vendors on a purchase order. */
export const vendorProducts = pgTable(
  'vendor_products',
  {
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.vendorId, table.productId] })],
);

/** On hand and reserved per product and location; changed only with a movement. */
export const stockLevels = pgTable(
  'stock_levels',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    locationId: uuid('location_id')
      .notNull()
      .references(() => stockLocations.id),
    onHand: doublePrecision('on_hand').notNull().default(0),
    reserved: doublePrecision('reserved').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.productId, table.locationId] })],
);

/** Below this many available units (all locations), the store gets a shortage alert. */
export const stockThresholds = pgTable('stock_thresholds', {
  productId: uuid('product_id')
    .primaryKey()
    .references(() => products.id, { onDelete: 'cascade' }),
  minimum: doublePrecision('minimum').notNull(),
  updatedAt: updatedAt(),
});

/** The stock ledger: every change to on-hand or reserved, with why and who. */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: primaryId(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    locationId: uuid('location_id')
      .notNull()
      .references(() => stockLocations.id),
    kind: stockMovementKindEnum('kind').notNull(),
    onHandDelta: doublePrecision('on_hand_delta').notNull(),
    reservedDelta: doublePrecision('reserved_delta').notNull(),
    projectId: uuid('project_id').references(() => projects.id),
    /** The receipt, reservation, dispatch or adjustment that caused it. */
    referenceId: uuid('reference_id'),
    note: text('note'),
    userId: uuid('user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    index('stock_movements_product_idx').on(table.productId),
    index('stock_movements_project_idx').on(table.projectId),
  ],
);

/** One serialised unit: received, then reserved for a project, then dispatched. */
export const stockSerials = pgTable(
  'stock_serials',
  {
    id: primaryId(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    serial: text('serial').notNull(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => stockLocations.id),
    status: serialStatusEnum('status').notNull().default('in_stock'),
    /** The goods receipt line it arrived on; null for opening stock entered by hand. */
    receiptLineId: uuid('receipt_line_id'),
    projectId: uuid('project_id').references(() => projects.id),
    dispatchId: uuid('dispatch_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('stock_serials_product_serial_unique').on(table.productId, table.serial),
    index('stock_serials_project_idx').on(table.projectId),
  ],
);
