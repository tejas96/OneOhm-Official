import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { products } from './catalog.schema';
import { calendarDate, createdAt, instant, money, primaryId, updatedAt } from './columns';
import { payables } from './finance.schema';
import { users } from './identity.schema';
import { stockLocations, vendors } from './inventory.schema';
import { projects } from './projects.schema';

export const purchaseOrderStatusEnum = pgEnum('purchase_order_status', [
  'draft',
  'sent',
  'partly_received',
  'received',
  'closed',
  'cancelled',
]);
export const reservationStatusEnum = pgEnum('reservation_status', [
  'active',
  'dispatched',
  'released',
]);

/** A purchase order to a vendor, for stock or for one project (PRD 3.10). */
export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: primaryId(),
    number: text('number').notNull(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id),
    projectId: uuid('project_id').references(() => projects.id),
    status: purchaseOrderStatusEnum('status').notNull().default('draft'),
    orderDate: calendarDate('order_date').notNull(),
    expectedOn: calendarDate('expected_on'),
    notes: text('notes'),
    subtotalPaise: money('subtotal_paise').notNull(),
    taxPaise: money('tax_paise').notNull(),
    totalPaise: money('total_paise').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    sentAt: instant('sent_at'),
    closedAt: instant('closed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('purchase_orders_number_unique').on(table.number),
    index('purchase_orders_project_idx').on(table.projectId),
  ],
);

/** A line on a PO. Lines without a product (site-specific items) are not stocked. */
export const purchaseOrderLines = pgTable(
  'purchase_order_lines',
  {
    id: primaryId(),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    productId: uuid('product_id').references(() => products.id),
    description: text('description').notNull(),
    unit: text('unit').notNull(),
    quantity: doublePrecision('quantity').notNull(),
    receivedQuantity: doublePrecision('received_quantity').notNull().default(0),
    ratePaise: money('rate_paise').notNull(),
    taxRateBp: integer('tax_rate_bp').notNull(),
  },
  (table) => [index('purchase_order_lines_po_idx').on(table.purchaseOrderId)],
);

/** Goods received against a PO, with the vendor's GST invoice (feeds the DCR report). */
export const goodsReceipts = pgTable(
  'goods_receipts',
  {
    id: primaryId(),
    number: text('number').notNull(),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id),
    locationId: uuid('location_id')
      .notNull()
      .references(() => stockLocations.id),
    receivedOn: calendarDate('received_on').notNull(),
    vendorInvoiceNumber: text('vendor_invoice_number'),
    vendorInvoiceDate: calendarDate('vendor_invoice_date'),
    notes: text('notes'),
    amountPaise: money('amount_paise').notNull(),
    payableId: uuid('payable_id').references(() => payables.id),
    receivedByUserId: uuid('received_by_user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('goods_receipts_number_unique').on(table.number)],
);

export const goodsReceiptLines = pgTable(
  'goods_receipt_lines',
  {
    id: primaryId(),
    receiptId: uuid('receipt_id')
      .notNull()
      .references(() => goodsReceipts.id, { onDelete: 'cascade' }),
    purchaseOrderLineId: uuid('purchase_order_line_id')
      .notNull()
      .references(() => purchaseOrderLines.id),
    productId: uuid('product_id').references(() => products.id),
    quantity: doublePrecision('quantity').notNull(),
    /** DCR panels: who made the cells and the GST invoice they came on. */
    cellManufacturer: text('cell_manufacturer'),
    cellInvoiceNumber: text('cell_invoice_number'),
  },
  (table) => [index('goods_receipt_lines_receipt_idx').on(table.receiptId)],
);

/** Material held for a project from its accepted quotation. */
export const stockReservations = pgTable(
  'stock_reservations',
  {
    id: primaryId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    locationId: uuid('location_id')
      .notNull()
      .references(() => stockLocations.id),
    quantity: doublePrecision('quantity').notNull(),
    status: reservationStatusEnum('status').notNull().default('active'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('stock_reservations_project_idx').on(table.projectId)],
);

/** A delivery challan: reserved material leaving the store for the site. */
export const dispatches = pgTable(
  'dispatches',
  {
    id: primaryId(),
    number: text('number').notNull(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    locationId: uuid('location_id')
      .notNull()
      .references(() => stockLocations.id),
    dispatchedOn: calendarDate('dispatched_on').notNull(),
    vehicle: text('vehicle'),
    driverName: text('driver_name'),
    driverPhone: text('driver_phone'),
    notes: text('notes'),
    /** Product, quantity and serials per line, as printed on the challan. */
    lines: jsonb('lines').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('dispatches_number_unique').on(table.number),
    index('dispatches_project_idx').on(table.projectId),
  ],
);
