import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { calendarDateSchema, idSchema, paiseSchema } from '../common/primitives';
import {
  customerBillingSchema,
  customerMoneyEntrySchema,
  gstinSchema,
  projectBillingSchema,
  refundMethodSchema,
  taxInvoiceSchema,
} from '../schemas/billing.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });
const projectParams = z.object({ projectId: idSchema });
const pdfResponse = c.otherResponse({ contentType: 'application/pdf', body: c.type<Blob>() });
const disposition = z.object({
  disposition: z.enum(['inline', 'attachment']).default('inline'),
});

/**
 * Customer billing (PRD 3.11): GST tax invoices for the full project price, customer
 * credit from overpayments, and refunds. Invoices post nothing to the ledger; credit
 * and refunds post their own balanced entries.
 */
export const billingContract = c.router({
  projectBilling: {
    method: 'GET',
    path: '/finance/projects/:projectId/billing',
    pathParams: projectParams,
    responses: { 200: projectBillingSchema },
  },
  issueInvoice: {
    method: 'POST',
    path: '/finance/projects/:projectId/invoices',
    pathParams: projectParams,
    body: z.object({ customerGstin: gstinSchema.nullable().optional() }),
    responses: { 201: taxInvoiceSchema },
    summary: 'Issues the tax invoice from the accepted quotation; numbered OH/INV/<FY>/0001.',
  },
  cancelInvoice: {
    method: 'POST',
    path: '/finance/invoices/:id/cancel',
    pathParams: idParams,
    body: z.object({ reason: z.string().trim().min(5, 'Say why, in a few words.').max(500) }),
    responses: { 200: taxInvoiceSchema },
    summary: 'An issued invoice is never edited: it is cancelled with a reason, then re-issued.',
  },
  listInvoices: {
    method: 'GET',
    path: '/finance/invoices',
    query: z.object({
      limit: z.coerce.number().int().min(1).max(500).default(100),
      /** Invoice number, customer, GSTIN or project code; every word must match. */
      q: z.string().trim().max(80).optional(),
      status: z.enum(['issued', 'cancelled']).optional(),
    }),
    responses: { 200: z.array(taxInvoiceSchema) },
    summary: 'Newest first; `q` and `status` filter every invoice, not only the newest.',
  },
  invoicePdf: {
    method: 'GET',
    path: '/finance/invoices/:id/pdf',
    pathParams: idParams,
    query: disposition,
    responses: { 200: pdfResponse },
  },
  recordRefund: {
    method: 'POST',
    path: '/finance/projects/:projectId/refunds',
    pathParams: projectParams,
    body: z.object({
      /** Null: out of the customer's credit. Set: money paid towards that milestone. */
      milestoneId: idSchema.nullable().optional(),
      amountPaise: paiseSchema.positive('Enter an amount above zero.'),
      method: refundMethodSchema,
      paidOn: calendarDateSchema,
      reference: z.string().trim().max(120).nullable().optional(),
      reason: z.string().trim().min(5, 'Say why, in a few words.').max(500),
    }),
    responses: { 201: customerMoneyEntrySchema },
  },
  applyCredit: {
    method: 'POST',
    path: '/finance/projects/:projectId/credit/apply',
    pathParams: projectParams,
    body: z.object({
      milestoneId: idSchema,
      amountPaise: paiseSchema.positive('Enter an amount above zero.'),
    }),
    responses: { 201: customerMoneyEntrySchema },
    summary: 'Pays a milestone from the customer’s credit; it gets a receipt like any payment.',
  },
  listCustomerMoney: {
    method: 'GET',
    path: '/finance/customer-money',
    query: z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) }),
    responses: { 200: z.array(customerMoneyEntrySchema) },
  },
});

/** The customer app's view of the same: their own invoices, receipts and refunds. */
export const customerBillingContract = c.router({
  billing: {
    method: 'GET',
    path: '/customer/billing',
    responses: { 200: customerBillingSchema },
  },
  invoicePdf: {
    method: 'GET',
    path: '/customer/invoices/:id/pdf',
    pathParams: idParams,
    responses: { 200: pdfResponse },
  },
  receiptPdf: {
    method: 'GET',
    path: '/customer/receipts/:id/pdf',
    pathParams: idParams,
    responses: { 200: pdfResponse },
  },
});
