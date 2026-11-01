import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
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
import { calendarDate, createdAt, instant, money, primaryId } from './columns';
import { customers } from './crm.schema';
import { paymentMethodEnum } from './enums';
import { paymentMilestones, payments } from './finance.schema';
import { users } from './identity.schema';
import { projects } from './projects.schema';
import { quotations } from './quotations.schema';

export const invoiceStatusEnum = pgEnum('invoice_status', ['issued', 'cancelled']);
export const supplyTypeEnum = pgEnum('supply_type', ['intra_state', 'inter_state']);

/**
 * GST tax invoices for a project's full price (PRD 3.11), made from the accepted
 * quotation. Fixed once issued: never edited, only cancelled with a reason and then
 * re-issued under a new number. Numbers run per financial year with no gaps
 * (OH/INV/2026-27/0001); a cancelled invoice keeps its number. The invoice is a
 * document over the milestone postings and posts nothing to the ledger itself.
 */
export const customerInvoices = pgTable(
  'customer_invoices',
  {
    id: primaryId(),
    number: text('number').notNull(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => quotations.id),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    invoiceDate: calendarDate('invoice_date').notNull(),
    status: invoiceStatusEnum('status').notNull().default('issued'),
    supply: supplyTypeEnum('supply').notNull(),
    supplierGstin: text('supplier_gstin').notNull(),
    supplierStateCode: text('supplier_state_code').notNull(),
    customerGstin: text('customer_gstin'),
    placeOfSupplyCode: text('place_of_supply_code').notNull(),
    placeOfSupplyState: text('place_of_supply_state').notNull(),
    valuePaise: money('value_paise').notNull(),
    discountPaise: money('discount_paise').notNull(),
    taxablePaise: money('taxable_paise').notNull(),
    cgstPaise: money('cgst_paise').notNull(),
    sgstPaise: money('sgst_paise').notNull(),
    igstPaise: money('igst_paise').notNull(),
    totalPaise: money('total_paise').notNull(),
    /** What the payment milestones added up to when it was issued (shown if different). */
    scheduleTotalPaise: money('schedule_total_paise').notNull(),
    /** Seller, buyer and site as printed, so later profile edits never change it. */
    parties: jsonb('parties').notNull(),
    replacesInvoiceId: uuid('replaces_invoice_id').references(
      (): AnyPgColumn => customerInvoices.id,
    ),
    issuedByUserId: uuid('issued_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    cancelledAt: instant('cancelled_at'),
    cancelledByUserId: uuid('cancelled_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    cancelReason: text('cancel_reason'),
  },
  (table) => [
    uniqueIndex('customer_invoices_number_unique').on(table.number),
    index('customer_invoices_project_idx').on(table.projectId),
    uniqueIndex('customer_invoices_one_issued')
      .on(table.projectId)
      .where(sql`${table.status} = 'issued'`),
  ],
);

export const customerInvoiceLines = pgTable(
  'customer_invoice_lines',
  {
    id: primaryId(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => customerInvoices.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
    description: text('description').notNull(),
    hsnSac: text('hsn_sac'),
    quantity: doublePrecision('quantity').notNull(),
    unit: text('unit').notNull(),
    valuePaise: money('value_paise').notNull(),
    discountPaise: money('discount_paise').notNull(),
    taxablePaise: money('taxable_paise').notNull(),
    taxRateBp: integer('tax_rate_bp').notNull(),
    cgstPaise: money('cgst_paise').notNull(),
    sgstPaise: money('sgst_paise').notNull(),
    igstPaise: money('igst_paise').notNull(),
    totalPaise: money('total_paise').notNull(),
  },
  (table) => [index('customer_invoice_lines_invoice_idx').on(table.invoiceId)],
);

/**
 * Money held for a customer that no milestone asked for, such as an online payment
 * above what was owed. It is applied to a milestone later (a `payments` row with
 * `paid_from_credit`) or refunded (`customer_refunds` without a milestone).
 */
export const customerCredits = pgTable(
  'customer_credits',
  {
    id: primaryId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    /** The milestone the money was paid towards, for the record. */
    milestoneId: uuid('milestone_id').references(() => paymentMilestones.id),
    amountPaise: money('amount_paise').notNull(),
    method: paymentMethodEnum('method').notNull(),
    receivedOn: calendarDate('received_on').notNull(),
    reference: text('reference'),
    /** A repeat gateway webhook never adds the same credit twice. */
    gatewayPaymentId: text('gateway_payment_id'),
    /** The gateway fee, when no payment row carried it (the whole amount was extra). */
    gatewayFeePaise: money('gateway_fee_paise'),
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    index('customer_credits_project_idx').on(table.projectId),
    uniqueIndex('customer_credits_gateway_payment_unique').on(table.gatewayPaymentId),
  ],
);

/**
 * Money paid back to a customer. Without a milestone it comes out of their credit;
 * with one it is money that had been paid towards that milestone, and a negative
 * `payments` row (`release_payment_id`) reopens it. Never edited.
 */
export const customerRefunds = pgTable(
  'customer_refunds',
  {
    id: primaryId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    milestoneId: uuid('milestone_id').references(() => paymentMilestones.id),
    releasePaymentId: uuid('release_payment_id').references(() => payments.id),
    amountPaise: money('amount_paise').notNull(),
    method: paymentMethodEnum('method').notNull(),
    paidOn: calendarDate('paid_on').notNull(),
    reference: text('reference'),
    reason: text('reason').notNull(),
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [index('customer_refunds_project_idx').on(table.projectId)],
);
