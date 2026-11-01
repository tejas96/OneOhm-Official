import { AGEING_BUCKETS, LEDGER_ACCOUNT_TYPES } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema, paiseSchema } from '../common/primitives';
import { userRefSchema } from './crm.schema';
import { openLinkSchema } from './payment-link.schema';

export const payerSchema = z.enum(['customer', 'bank']);
export const moneyInMethodSchema = z.enum([
  'cash',
  'cheque',
  'bank_transfer',
  'upi',
  'razorpay',
  'bank_disbursement',
]);
export const moneyOutMethodSchema = z.enum(['cash', 'cheque', 'bank_transfer', 'upi']);
export const ageingBucketSchema = z.enum(AGEING_BUCKETS);

/** One milestone still owed, with what to do next (PRD 3.11). */
export const receivableSchema = z.object({
  milestoneId: idSchema,
  projectId: idSchema,
  projectCode: z.string(),
  customerName: z.string(),
  payer: payerSchema,
  label: z.string(),
  amountPaise: paiseSchema,
  paidPaise: paiseSchema,
  outstandingPaise: paiseSchema,
  status: z.enum(['upcoming', 'due', 'partly_paid']),
  dueOn: calendarDateSchema.nullable(),
  daysSinceDue: z.number().int().nullable(),
  bucket: ageingBucketSchema.nullable(),
  /** "Customer payment pending" vs "Waiting for bank disbursement" vs not due yet. */
  nextAction: z.enum(['collect_from_customer', 'claim_from_bank', 'not_due_yet']),
  link: openLinkSchema,
});
export type Receivable = z.infer<typeof receivableSchema>;

export const receivedPaymentSchema = z.object({
  id: idSchema,
  /** Receipts are numbered per financial year; reversal rows have none. */
  receiptNumber: z.string().nullable(),
  projectId: idSchema,
  projectCode: z.string(),
  customerName: z.string(),
  milestoneLabel: z.string().nullable(),
  payer: payerSchema,
  method: moneyInMethodSchema,
  amountPaise: paiseSchema,
  receivedOn: calendarDateSchema,
  reference: z.string().nullable(),
  reversed: z.boolean(),
  reversesPaymentId: idSchema.nullable(),
  reversalReason: z.string().nullable(),
  /** When it was recorded, to order it among refunds and credit on the same day. */
  createdAt: instantSchema,
});
export type ReceivedPayment = z.infer<typeof receivedPaymentSchema>;

export const payableSchema = z.object({
  id: idSchema,
  projectId: idSchema.nullable(),
  projectCode: z.string().nullable(),
  party: z.enum(['vendor', 'contractor']),
  partyName: z.string(),
  description: z.string(),
  billNumber: z.string().nullable(),
  amountPaise: paiseSchema,
  dueOn: calendarDateSchema,
  status: z.enum(['pending', 'approved', 'paid']),
  overdue: z.boolean(),
  approvedBy: userRefSchema.nullable(),
  approvedAt: instantSchema.nullable(),
  paidOn: calendarDateSchema.nullable(),
  paidMethod: moneyInMethodSchema.nullable(),
  paidReference: z.string().nullable(),
  createdAt: instantSchema,
});
export type Payable = z.infer<typeof payableSchema>;

const ageingSchema = z.object({
  current: paiseSchema,
  days_31_60: paiseSchema,
  days_61_90: paiseSchema,
  days_over_90: paiseSchema,
});

export const financeOverviewSchema = z.object({
  balances: z.object({ bankPaise: paiseSchema, cashPaise: paiseSchema, gatewayPaise: paiseSchema }),
  receivables: z.object({
    customerPaise: paiseSchema,
    bankPaise: paiseSchema,
    advancesPaise: paiseSchema,
    notDueYetPaise: paiseSchema,
    ageing: ageingSchema,
  }),
  payables: z.object({
    awaitingApprovalPaise: paiseSchema,
    awaitingApprovalCount: z.number().int(),
    approvedUnpaidPaise: paiseSchema,
    dueThisWeekPaise: paiseSchema,
    overduePaise: paiseSchema,
  }),
  /** Money in (received) and out (bills paid) for the last six months, oldest first. */
  monthly: z.array(z.object({ month: z.string(), inPaise: paiseSchema, outPaise: paiseSchema })),
});
export type FinanceOverview = z.infer<typeof financeOverviewSchema>;

export const lendingPartnerSchema = z.object({
  id: idSchema,
  name: z.string(),
  requiredDocuments: z.array(z.string()),
  disbursement: z.enum(['single', 'tranches']),
  notes: z.string().nullable(),
  active: z.boolean(),
});
export type LendingPartner = z.infer<typeof lendingPartnerSchema>;

export const loanStatusSchema = z.enum([
  'collecting_documents',
  'submitted',
  'sanctioned',
  'disbursing',
  'disbursed',
  'rejected',
]);

export const loanTrancheSchema = z.object({
  id: idSchema,
  label: z.string(),
  amountPaise: paiseSchema,
  expectedOn: calendarDateSchema.nullable(),
  status: z.enum(['planned', 'claimed', 'received']),
  claimedOn: calendarDateSchema.nullable(),
  paymentId: idSchema.nullable(),
});

/** Bank finance for one loan project, kept consistent with its bank milestone. */
export const projectLoanSchema = z.object({
  projectId: idSchema,
  projectCode: z.string(),
  customerName: z.string(),
  /** False until finance first saves the loan; until then it shows what the project knows. */
  started: z.boolean(),
  version: z.number().int().nullable(),
  lendingPartnerId: idSchema.nullable(),
  lenderName: z.string(),
  applicationNumber: z.string().nullable(),
  status: loanStatusSchema,
  sanctionedPaise: paiseSchema.nullable(),
  sanctionedOn: calendarDateSchema.nullable(),
  documents: z.array(z.object({ name: z.string(), received: z.boolean() })),
  notes: z.string().nullable(),
  bankMilestoneId: idSchema.nullable(),
  bankSharePaise: paiseSchema,
  receivedPaise: paiseSchema,
  /** The claim task is done (or the bank milestone is due) and money is still owed. */
  readyToClaim: z.boolean(),
  tranches: z.array(loanTrancheSchema),
});
export type ProjectLoan = z.infer<typeof projectLoanSchema>;

export const journalEntrySchema = z.object({
  id: idSchema,
  number: z.number().int(),
  entryDate: calendarDateSchema,
  memo: z.string(),
  sourceType: z.string(),
  projectCode: z.string().nullable(),
  reversedByNumber: z.number().int().nullable(),
  reversesNumber: z.number().int().nullable(),
  postedBy: userRefSchema.nullable(),
  lines: z.array(
    z.object({
      accountCode: z.string(),
      accountName: z.string(),
      debitPaise: paiseSchema,
      creditPaise: paiseSchema,
    }),
  ),
});
export type JournalEntry = z.infer<typeof journalEntrySchema>;

export const trialBalanceSchema = z.object({
  accounts: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      type: z.enum(LEDGER_ACCOUNT_TYPES),
      debitPaise: paiseSchema,
      creditPaise: paiseSchema,
      /** In the account's normal direction (debit for assets and expenses). */
      balancePaise: paiseSchema,
    }),
  ),
  totalDebitPaise: paiseSchema,
  totalCreditPaise: paiseSchema,
  balanced: z.boolean(),
  entries: z.number().int(),
});
export type TrialBalance = z.infer<typeof trialBalanceSchema>;
