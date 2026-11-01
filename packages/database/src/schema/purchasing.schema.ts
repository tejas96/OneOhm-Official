import { PURCHASE_REQUEST_STATUSES, VENDOR_ADVANCE_STATUSES } from '@oneohm/domain';
import {
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { products } from './catalog.schema';
import { calendarDate, createdAt, instant, money, primaryId, updatedAt } from './columns';
import { paymentMethodEnum } from './enums';
import { payables } from './finance.schema';
import { users } from './identity.schema';
import { vendors } from './inventory.schema';
import { purchaseOrders } from './procurement.schema';
import { projects } from './projects.schema';

export const purchaseRequestStatusEnum = pgEnum(
  'purchase_request_status',
  PURCHASE_REQUEST_STATUSES,
);
export const vendorAdvanceStatusEnum = pgEnum('vendor_advance_status', VENDOR_ADVANCE_STATUSES);

/**
 * A request for material, for stock or for one project (PRD 3.10). Procurement approves
 * or rejects it with a note, then turns it into a draft purchase order.
 */
export const purchaseRequests = pgTable(
  'purchase_requests',
  {
    id: primaryId(),
    number: text('number').notNull(),
    projectId: uuid('project_id').references(() => projects.id),
    reason: text('reason').notNull(),
    status: purchaseRequestStatusEnum('status').notNull().default('pending'),
    requestedByUserId: uuid('requested_by_user_id')
      .notNull()
      .references(() => users.id),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id),
    decidedAt: instant('decided_at'),
    decisionNote: text('decision_note'),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('purchase_requests_number_unique').on(table.number),
    index('purchase_requests_status_idx').on(table.status),
    index('purchase_requests_project_idx').on(table.projectId),
  ],
);

export const purchaseRequestLines = pgTable(
  'purchase_request_lines',
  {
    id: primaryId(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => purchaseRequests.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    quantity: doublePrecision('quantity').notNull(),
    neededBy: calendarDate('needed_by').notNull(),
  },
  (table) => [index('purchase_request_lines_request_idx').on(table.requestId)],
);

/**
 * Money paid to a vendor before the goods, against one purchase order (PRD 3.10, 3.11).
 * Recorded, approved and paid like a bill; `adjustedPaise` is how much has since been
 * set against the vendor's approved bills for that order.
 */
export const vendorAdvances = pgTable(
  'vendor_advances',
  {
    id: primaryId(),
    number: text('number').notNull(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id),
    amountPaise: money('amount_paise').notNull(),
    note: text('note'),
    status: vendorAdvanceStatusEnum('status').notNull().default('pending'),
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    approvedAt: instant('approved_at'),
    paidOn: calendarDate('paid_on'),
    paidMethod: paymentMethodEnum('paid_method'),
    paidReference: text('paid_reference'),
    paidByUserId: uuid('paid_by_user_id').references(() => users.id),
    paidAt: instant('paid_at'),
    cancelledAt: instant('cancelled_at'),
    adjustedPaise: money('adjusted_paise').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('vendor_advances_number_unique').on(table.number),
    index('vendor_advances_vendor_idx').on(table.vendorId),
    index('vendor_advances_order_idx').on(table.purchaseOrderId),
  ],
);

/** One advance set against one approved bill; each is posted to the ledger once. */
export const vendorAdvanceAdjustments = pgTable(
  'vendor_advance_adjustments',
  {
    id: primaryId(),
    advanceId: uuid('advance_id')
      .notNull()
      .references(() => vendorAdvances.id),
    payableId: uuid('payable_id')
      .notNull()
      .references(() => payables.id),
    amountPaise: money('amount_paise').notNull(),
    adjustedOn: calendarDate('adjusted_on').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('vendor_advance_adjustments_pair_unique').on(table.advanceId, table.payableId),
    index('vendor_advance_adjustments_payable_idx').on(table.payableId),
  ],
);
