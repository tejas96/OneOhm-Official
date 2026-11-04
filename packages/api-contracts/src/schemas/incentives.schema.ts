import {
  COMMISSION_BASES,
  INCENTIVE_STATUSES,
  QUALIFYING_EVENTS,
  REFERRAL_REWARD_BASES,
} from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema, paiseSchema } from '../common/primitives';
import { leadStageSchema, userRefSchema } from './crm.schema';
import { moneyOutMethodSchema } from './finance.schema';
import { epcStageSchema, projectTypeSchema } from './project.schema';

export const qualifyingEventSchema = z.enum(QUALIFYING_EVENTS);
export const referralRewardBasisSchema = z.enum(REFERRAL_REWARD_BASES);
export const commissionBasisSchema = z.enum(COMMISSION_BASES);
export const incentiveStatusSchema = z.enum(INCENTIVE_STATUSES);
export type IncentiveStatusValue = z.infer<typeof incentiveStatusSchema>;

const optionalPaise = z.number().int().min(0).nullable();

/** The refer-and-earn programme as the owner sets it (PRD 5.6, 7.2). */
export const referralProgramInputSchema = z.object({
  active: z.boolean(),
  basis: referralRewardBasisSchema,
  amountPaise: z.number().int().min(0).max(10_000_000),
  qualifyingEvent: qualifyingEventSchema,
  startsOn: calendarDateSchema,
  budgetPaise: optionalPaise,
  perCustomerCount: z.number().int().min(1).max(1000).nullable(),
  perCustomerPaise: optionalPaise,
  eligibleTypes: z.array(projectTypeSchema),
  shareNumber: z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^\+?\d{10,13}$/, 'Use a 10-digit mobile number.'))
    .nullable(),
});
export type ReferralProgramInput = z.infer<typeof referralProgramInputSchema>;

export const referralProgramSchema = referralProgramInputSchema.extend({
  shareNumber: z.string().nullable(),
  /** The number friends message when no share number is set: the company's first phone. */
  defaultShareNumber: z.string().nullable(),
  /** What the campaign has committed (pending, approved and paid rewards). */
  committedPaise: paiseSchema,
  paidPaise: paiseSchema,
  updatedAt: instantSchema.nullable(),
});
export type ReferralProgram = z.infer<typeof referralProgramSchema>;

const payoutFields = {
  status: incentiveStatusSchema,
  amountPaise: paiseSchema,
  qualifyingEvent: qualifyingEventSchema,
  earnedAt: instantSchema,
  approvedAt: instantSchema.nullable(),
  approvedBy: userRefSchema.nullable(),
  rejectReason: z.string().nullable(),
  paidOn: calendarDateSchema.nullable(),
  paidMethod: moneyOutMethodSchema.nullable(),
  paidReference: z.string().nullable(),
};

/** A reward for one referred customer whose project reached the qualifying event. */
export const referralRewardSchema = z.object({
  id: idSchema,
  ...payoutFields,
  referrer: z.object({ id: idSchema, name: z.string(), phone: z.string() }),
  friendName: z.string(),
  leadId: idSchema,
  projectId: idSchema,
  projectCode: z.string(),
  capacityWp: z.number().int(),
  basis: referralRewardBasisSchema,
  ratePaise: paiseSchema,
});
export type ReferralReward = z.infer<typeof referralRewardSchema>;

export const incentiveFilterSchema = z.enum([
  'open',
  'pending',
  'approved',
  'paid',
  'rejected',
  'all',
]);
export type IncentiveFilter = z.infer<typeof incentiveFilterSchema>;

export const payoutInputSchema = z.object({
  method: moneyOutMethodSchema,
  paidOn: calendarDateSchema,
  reference: z.string().trim().max(120).nullable().optional(),
});
export type PayoutInput = z.infer<typeof payoutInputSchema>;

export const rejectInputSchema = z.object({
  reason: z.string().trim().min(3, 'Say why it is not approved.').max(300),
});

/** A commission rule; `reseller` is null for the default everyone else follows. */
export const commissionRuleInputSchema = z.object({
  basis: commissionBasisSchema,
  rateBp: z.number().int().min(0).max(5000),
  perKwPaise: z.number().int().min(0).max(10_000_000),
  qualifyingEvent: qualifyingEventSchema,
  active: z.boolean(),
});
export type CommissionRuleInput = z.infer<typeof commissionRuleInputSchema>;

export const commissionRuleSchema = commissionRuleInputSchema.extend({
  id: idSchema.nullable(),
  reseller: userRefSchema.nullable(),
  updatedAt: instantSchema.nullable(),
});
export type CommissionRule = z.infer<typeof commissionRuleSchema>;

const payoutText = z.string().max(60).nullable();

/** Where a reseller's commission is paid. Values come back masked unless finance asks. */
export const payoutDetailsInputSchema = z.object({
  bankAccountName: z.string().max(120).nullable(),
  bankAccountNumber: payoutText,
  bankIfsc: payoutText,
  upiId: payoutText,
  pan: payoutText,
});
export type PayoutDetailsInput = z.infer<typeof payoutDetailsInputSchema>;

export const payoutDetailsSchema = payoutDetailsInputSchema.extend({ complete: z.boolean() });
export type PayoutDetailsView = z.infer<typeof payoutDetailsSchema>;

/** Commission on one project a reseller sold. */
export const commissionEntrySchema = z.object({
  id: idSchema,
  ...payoutFields,
  reseller: userRefSchema,
  projectId: idSchema,
  projectCode: z.string(),
  customerName: z.string(),
  capacityWp: z.number().int(),
  projectValuePaise: paiseSchema,
  basis: commissionBasisSchema,
  rateBp: z.number().int(),
  perKwPaise: paiseSchema,
  /** False until the reseller has PAN plus UPI or bank details; finance cannot pay before. */
  payoutReady: z.boolean(),
});
export type CommissionEntry = z.infer<typeof commissionEntrySchema>;

export const incentiveTotalsSchema = z.object({
  earnedPaise: paiseSchema,
  pendingPaise: paiseSchema,
  approvedPaise: paiseSchema,
  paidPaise: paiseSchema,
});

/** One reseller's numbers for the performance table (PRD 3.3). */
export const resellerPerformanceSchema = z.object({
  reseller: userRefSchema.extend({ phone: z.string().nullable(), active: z.boolean() }),
  leads: z.number().int(),
  openLeads: z.number().int(),
  won: z.number().int(),
  lost: z.number().int(),
  conversionBp: z.number().int(),
  projects: z.number().int(),
  valueSoldPaise: paiseSchema,
  capacitySoldWp: z.number().int(),
  totals: incentiveTotalsSchema,
  rule: commissionRuleSchema,
  customRule: z.boolean(),
});
export type ResellerPerformance = z.infer<typeof resellerPerformanceSchema>;

/**
 * A reseller's own customer, as the reseller may see it: progress and their commission,
 * never margins, internal notes or anyone else's leads (PRD 4.8).
 */
export const resellerCustomerSchema = z.object({
  leadId: idSchema,
  name: z.string(),
  city: z.string(),
  leadStage: leadStageSchema,
  estimatedWp: z.number().int().nullable(),
  createdAt: instantSchema,
  project: z
    .object({
      id: idSchema,
      code: z.string(),
      capacityWp: z.number().int(),
      status: z.string(),
      currentStage: epcStageSchema,
      progressBp: z.number().int(),
      valuePaise: paiseSchema,
      startDate: calendarDateSchema,
    })
    .nullable(),
  commission: z
    .object({
      status: incentiveStatusSchema.or(z.literal('upcoming')),
      amountPaise: paiseSchema,
    })
    .nullable(),
});
export type ResellerCustomer = z.infer<typeof resellerCustomerSchema>;

/** What a signed-in reseller sees about their own commission. */
export const resellerEarningsSchema = z.object({
  rule: commissionRuleSchema,
  totals: incentiveTotalsSchema,
  /** Commission still to be earned on projects that have not reached the event. */
  upcomingPaise: paiseSchema,
  entries: z.array(commissionEntrySchema.omit({ reseller: true, approvedBy: true })),
});
export type ResellerEarnings = z.infer<typeof resellerEarningsSchema>;

/** The customer's code, the programme terms and where friends send the code. */
export const customerReferralProgramSchema = z.object({
  code: z.string(),
  active: z.boolean(),
  basis: referralRewardBasisSchema,
  amountPaise: paiseSchema,
  qualifyingEvent: qualifyingEventSchema,
  /** Digits only, ready for a wa.me link; null when OneOhm has no number set. */
  whatsappNumber: z.string().nullable(),
  totals: incentiveTotalsSchema,
});
export type CustomerReferralProgram = z.infer<typeof customerReferralProgramSchema>;
