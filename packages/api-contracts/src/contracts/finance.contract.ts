import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { calendarDateSchema, idSchema, noteSchema, paiseSchema } from '../common/primitives';
import {
  financeOverviewSchema,
  journalEntrySchema,
  lendingPartnerSchema,
  loanStatusSchema,
  moneyOutMethodSchema,
  payableReviewSchema,
  payableSchema,
  projectLoanSchema,
  receivableSchema,
  receivedPaymentSchema,
  trialBalanceSchema,
} from '../schemas/finance.schema';
import { payablePaymentSchema, undoPaymentBodySchema } from '../schemas/payable-payment.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });
const projectParams = z.object({ projectId: idSchema });
const pdfResponse = c.otherResponse({ contentType: 'application/pdf', body: c.type<Blob>() });
const shortText = (max: number) => z.string().trim().max(max);

const lenderBody = z.object({
  name: z.string().trim().min(2, 'Use at least 2 characters.').max(120),
  requiredDocuments: z.array(shortText(120).min(1)).max(30).default([]),
  disbursement: z.enum(['single', 'tranches']).default('single'),
  /** Each part's name and share in basis points; the parts add up to 100%. */
  tranchePattern: z
    .array(z.object({ label: shortText(60).min(1), shareBp: z.number().int().min(1).max(10_000) }))
    .max(6)
    .default([]),
  notes: noteSchema.nullable().optional(),
  active: z.boolean().default(true),
});

/**
 * Finance (PRD 3.11): receivables, payables, loans, receipts and the double-entry
 * ledger. Postings happen automatically; nothing here edits a journal entry.
 */
export const financeContract = c.router({
  getOverview: {
    method: 'GET',
    path: '/finance/overview',
    responses: { 200: financeOverviewSchema },
  },
  listReceivables: {
    method: 'GET',
    path: '/finance/receivables',
    responses: { 200: z.array(receivableSchema) },
  },
  listPayments: {
    method: 'GET',
    path: '/finance/payments',
    query: z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }),
    responses: { 200: z.array(receivedPaymentSchema) },
  },
  reversePayment: {
    method: 'POST',
    path: '/finance/payments/:id/reverse',
    pathParams: idParams,
    body: z.object({ reason: z.string().trim().min(5, 'Say why, in a few words.').max(500) }),
    responses: { 201: receivedPaymentSchema },
    summary: 'A mistaken payment is never edited: a reversal row and a reversing entry.',
  },
  paymentReceipt: {
    method: 'GET',
    path: '/finance/payments/:id/receipt',
    pathParams: idParams,
    query: z.object({ disposition: z.enum(['inline', 'attachment']).default('inline') }),
    responses: { 200: pdfResponse },
  },
  listPayables: {
    method: 'GET',
    path: '/finance/payables',
    query: z.object({
      status: z.enum(['open', 'pending', 'approved', 'paid', 'all']).default('open'),
    }),
    responses: { 200: z.array(payableSchema) },
  },
  createPayable: {
    method: 'POST',
    path: '/finance/payables',
    body: z.object({
      projectId: idSchema.nullable().optional(),
      party: z.enum(['vendor', 'contractor']),
      partyName: z.string().trim().min(2, 'Name the vendor or crew.').max(160),
      description: z.string().trim().min(3, 'Say what the bill is for.').max(300),
      billNumber: shortText(60).nullable().optional(),
      amountPaise: paiseSchema.positive('Enter an amount above zero.'),
      dueOn: calendarDateSchema,
      /** TDS to hold on the bill, in basis points (1% = 100). */
      tdsBp: payableReviewSchema.shape.tdsBp.default(0),
    }),
    responses: { 201: payableSchema },
  },
  reviewPayable: {
    method: 'PATCH',
    path: '/finance/payables/:id',
    pathParams: idParams,
    body: payableReviewSchema,
    responses: { 200: payableSchema },
    summary: "Before approval: the vendor's invoice total and the TDS rate on the bill.",
  },
  approvePayable: {
    method: 'POST',
    path: '/finance/payables/:id/approve',
    pathParams: idParams,
    body: c.noBody(),
    responses: { 200: payableSchema },
  },
  payPayable: {
    method: 'POST',
    path: '/finance/payables/:id/pay',
    pathParams: idParams,
    body: z.object({
      method: moneyOutMethodSchema,
      paidOn: calendarDateSchema,
      reference: shortText(120).nullable().optional(),
      /** A part of the bill; leave out to pay all that is left. */
      amountPaise: paiseSchema.optional(),
    }),
    responses: { 200: payableSchema },
  },
  listPayablePayments: {
    method: 'GET',
    path: '/payables/:id/payments',
    pathParams: idParams,
    responses: { 200: z.array(payablePaymentSchema) },
    summary: 'Every payment made on a bill, newest first, with whether the caller may undo it.',
  },
  undoPayablePayment: {
    method: 'POST',
    path: '/payables/:id/payments/:paymentId/undo',
    pathParams: z.object({ id: idSchema, paymentId: idSchema }),
    body: undoPaymentBodySchema,
    responses: { 200: payableSchema },
    summary:
      'Undoes a payment recorded by hand: marks it reversed with the reason and reverses its ledger entry. Needs approve payments, or record payments for the same person within 24 hours. Bank transfers cannot be undone here.',
  },
  listLoans: {
    method: 'GET',
    path: '/finance/loans',
    responses: { 200: z.array(projectLoanSchema) },
  },
  saveLoan: {
    method: 'PUT',
    path: '/finance/loans/:projectId',
    pathParams: projectParams,
    body: z.object({
      version: z.number().int().nullable(),
      lendingPartnerId: idSchema.nullable().optional(),
      lenderName: z.string().trim().min(2, 'Name the lender.').max(120),
      applicationNumber: shortText(60).nullable().optional(),
      status: loanStatusSchema,
      sanctionedPaise: paiseSchema.positive().nullable().optional(),
      sanctionedOn: calendarDateSchema.nullable().optional(),
      documents: z.array(z.object({ name: shortText(120).min(1), received: z.boolean() })).max(30),
      notes: noteSchema.nullable().optional(),
      tranches: z
        .array(
          z.object({
            id: idSchema.nullable().optional(),
            label: z.string().trim().min(2).max(80),
            amountPaise: paiseSchema.positive(),
            expectedOn: calendarDateSchema.nullable().optional(),
            claimed: z.boolean().default(false),
          }),
        )
        .max(12),
    }),
    responses: { 200: projectLoanSchema },
  },
  recordDisbursement: {
    method: 'POST',
    path: '/finance/loans/:projectId/disbursements',
    pathParams: projectParams,
    body: z.object({
      trancheId: idSchema.nullable().optional(),
      amountPaise: paiseSchema.positive(),
      receivedOn: calendarDateSchema,
      reference: shortText(120).nullable().optional(),
    }),
    responses: { 201: projectLoanSchema },
    summary: 'Recorded as a bank-disbursement payment against the project’s bank milestone.',
  },
  listLenders: {
    method: 'GET',
    path: '/finance/lenders',
    responses: { 200: z.array(lendingPartnerSchema) },
  },
  createLender: {
    method: 'POST',
    path: '/finance/lenders',
    body: lenderBody,
    responses: { 201: lendingPartnerSchema },
  },
  updateLender: {
    method: 'PATCH',
    path: '/finance/lenders/:id',
    pathParams: idParams,
    body: lenderBody.partial(),
    responses: { 200: lendingPartnerSchema },
  },
  listJournal: {
    method: 'GET',
    path: '/finance/journal',
    query: z.object({
      before: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      projectId: idSchema.optional(),
      /** A JV number ("JV-12"), words of the memo, or a project code. */
      q: z.string().trim().max(80).optional(),
    }),
    responses: { 200: z.array(journalEntrySchema) },
  },
  trialBalance: {
    method: 'GET',
    path: '/finance/trial-balance',
    responses: { 200: trialBalanceSchema },
  },
});
