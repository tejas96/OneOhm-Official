import { EPC_STAGES } from '@oneohm/domain';
import { z } from 'zod';
import {
  calendarDateSchema,
  idSchema,
  instantSchema,
  nameSchema,
  noteSchema,
  paiseSchema,
  phoneSchema,
} from '../common/primitives';

export const customerProfileSchema = z.object({
  id: idSchema,
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
});
export type CustomerProfile = z.infer<typeof customerProfileSchema>;

const journeyStageSchema = z.object({
  stage: z.enum(EPC_STAGES),
  state: z.enum(['done', 'current', 'upcoming', 'skipped']),
});

const milestoneLineSchema = z.object({
  label: z.string(),
  payer: z.enum(['customer', 'bank']),
  amountPaise: paiseSchema,
  paidPaise: paiseSchema,
  status: z.enum(['upcoming', 'due', 'partly_paid', 'paid']),
  dueAt: instantSchema.nullable(),
});

/** One home as the customer sees it: the journey, the money and who to call. */
export const customerProjectSchema = z.object({
  id: idSchema,
  code: z.string(),
  capacityWp: z.number().int(),
  type: z.enum(['residential', 'society', 'commercial']),
  place: z.string(),
  status: z.enum(['active', 'operational', 'completed', 'cancelled']),
  currentStage: z.enum(EPC_STAGES),
  stages: z.array(journeyStageSchema),
  updates: z.array(
    z.object({
      title: z.string(),
      done: z.boolean(),
      date: calendarDateSchema,
    }),
  ),
  nextStep: z.object({ title: z.string(), date: calendarDateSchema }).nullable(),
  payments: z.object({
    totalPaise: paiseSchema,
    paidPaise: paiseSchema,
    milestones: z.array(milestoneLineSchema),
  }),
  subsidy: z.object({
    amountPaise: paiseSchema,
    status: z.enum(['not_applicable', 'pending', 'applied', 'released']),
  }),
  quotation: z.object({ id: idSchema, number: z.string() }),
  contact: z.object({ name: z.string(), phone: z.string().nullable() }).nullable(),
  feedbackGiven: z.boolean(),
});
export type CustomerProject = z.infer<typeof customerProjectSchema>;

export const customerHomeSchema = z.object({
  customer: customerProfileSchema,
  projects: z.array(customerProjectSchema),
});
export type CustomerHome = z.infer<typeof customerHomeSchema>;

export const referralInputSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  city: z.string().trim().max(120).optional(),
  note: noteSchema.optional(),
});

export const referralSchema = z.object({
  id: idSchema,
  name: z.string(),
  status: z.enum(['received', 'in_progress', 'installed', 'closed']),
  createdAt: instantSchema,
});
export type Referral = z.infer<typeof referralSchema>;

export const SERVICE_CATEGORIES = [
  'no_generation',
  'low_generation',
  'inverter_error',
  'physical_damage',
  'cleaning',
  'billing_net_meter',
  'subsidy',
  'other',
] as const;

export const serviceRequestInputSchema = z.object({
  projectId: idSchema.nullable().optional(),
  category: z.enum(SERVICE_CATEGORIES),
  description: z.string().trim().min(5, 'Tell us a little more.').max(2000),
});

export const serviceRequestSchema = z.object({
  id: idSchema,
  projectCode: z.string().nullable(),
  category: z.enum(SERVICE_CATEGORIES),
  description: z.string(),
  status: z.enum(['open', 'in_progress', 'resolved']),
  resolutionNote: z.string().nullable(),
  createdAt: instantSchema,
  resolvedAt: instantSchema.nullable(),
});
export type ServiceRequest = z.infer<typeof serviceRequestSchema>;

export const feedbackInputSchema = z.object({
  projectId: idSchema,
  rating: z.number().int().min(1).max(5),
  comment: noteSchema.optional(),
});
