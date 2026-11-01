import { isValidGstin } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema, paiseSchema } from '../common/primitives';
import { userRefSchema } from './crm.schema';
import { moneyInMethodSchema } from './finance.schema';

export const supplyTypeSchema = z.enum(['intra_state', 'inter_state']);
/** How money goes back to a customer: the four ways out, or back through the gateway. */
export const refundMethodSchema = z.enum(['cash', 'cheque', 'bank_transfer', 'upi', 'razorpay']);

/** A GSTIN as typed: spaces dropped, upper case, format and check character verified. */
export const gstinSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, '').toUpperCase())
  .refine(isValidGstin, 'Enter a valid 15-character GSTIN.');

/** One GST tax invoice, fixed once issued (PRD 3.11). */
export const taxInvoiceSchema = z.object({
  id: idSchema,
  number: z.string(),
  projectId: idSchema,
  projectCode: z.string(),
  customerName: z.string(),
  invoiceDate: calendarDateSchema,
  status: z.enum(['issued', 'cancelled']),
  supply: supplyTypeSchema,
  /** "27-Maharashtra": where the system is installed. */
  placeOfSupply: z.string(),
  customerGstin: z.string().nullable(),
  taxablePaise: paiseSchema,
  cgstPaise: paiseSchema,
  sgstPaise: paiseSchema,
  igstPaise: paiseSchema,
  totalPaise: paiseSchema,
  /** The payment schedule's total when issued; `differencePaise` = total − schedule. */
  scheduleTotalPaise: paiseSchema,
  differencePaise: paiseSchema,
  cancelledAt: instantSchema.nullable(),
  cancelReason: z.string().nullable(),
  replacesNumber: z.string().nullable(),
  replacedByNumber: z.string().nullable(),
  issuedBy: userRefSchema.nullable(),
  createdAt: instantSchema,
});
export type TaxInvoice = z.infer<typeof taxInvoiceSchema>;

/** What an invoice issued now would say, or why one cannot be issued yet. */
export const invoiceDraftSchema = z.object({
  blocker: z.enum(['quotation_not_accepted', 'property_state_unknown', 'company_gstin']).nullable(),
  supply: supplyTypeSchema.nullable(),
  placeOfSupply: z.string().nullable(),
  customerGstin: z.string().nullable(),
  lineCount: z.number().int(),
  /** Lines whose catalog product has no HSN/SAC code (or that are not catalog products). */
  linesWithoutCode: z.number().int(),
  taxablePaise: paiseSchema,
  cgstPaise: paiseSchema,
  sgstPaise: paiseSchema,
  igstPaise: paiseSchema,
  totalPaise: paiseSchema,
  scheduleTotalPaise: paiseSchema,
  differencePaise: paiseSchema,
});
export type InvoiceDraft = z.infer<typeof invoiceDraftSchema>;

/** Money held for, applied for or paid back to a customer (PRD 3.11 refunds and excess). */
export const customerMoneyEntrySchema = z.object({
  id: idSchema,
  kind: z.enum(['credit_received', 'credit_applied', 'refund']),
  projectId: idSchema,
  projectCode: z.string(),
  customerName: z.string(),
  /** Always positive; the kind says which way it went. */
  amountPaise: paiseSchema,
  date: calendarDateSchema,
  method: moneyInMethodSchema,
  reference: z.string().nullable(),
  milestoneLabel: z.string().nullable(),
  /** A refund's reason. */
  reason: z.string().nullable(),
  /** For a refund of milestone money: the negative payment row it added. */
  releasePaymentId: idSchema.nullable(),
  createdAt: instantSchema,
});
export type CustomerMoneyEntry = z.infer<typeof customerMoneyEntrySchema>;

/** Invoices, credit and refunds for one project: the project's Payments tab. */
export const projectBillingSchema = z.object({
  projectId: idSchema,
  invoices: z.array(taxInvoiceSchema),
  draft: invoiceDraftSchema,
  creditPaise: paiseSchema,
  entries: z.array(customerMoneyEntrySchema),
});
export type ProjectBilling = z.infer<typeof projectBillingSchema>;

/** What the customer app shows: their invoices, receipts, refunds and credit (PRD 5.3). */
export const customerBillingSchema = z.array(
  z.object({
    projectId: idSchema,
    projectCode: z.string(),
    creditPaise: paiseSchema,
    invoices: z.array(
      z.object({
        id: idSchema,
        number: z.string(),
        invoiceDate: calendarDateSchema,
        totalPaise: paiseSchema,
        status: z.enum(['issued', 'cancelled']),
      }),
    ),
    receipts: z.array(
      z.object({
        id: idSchema,
        number: z.string(),
        receivedOn: calendarDateSchema,
        amountPaise: paiseSchema,
        milestoneLabel: z.string().nullable(),
        reversed: z.boolean(),
      }),
    ),
    refunds: z.array(
      z.object({
        id: idSchema,
        paidOn: calendarDateSchema,
        amountPaise: paiseSchema,
        method: refundMethodSchema,
      }),
    ),
  }),
);
export type CustomerBilling = z.infer<typeof customerBillingSchema>;
