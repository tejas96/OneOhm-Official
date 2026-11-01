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
import { customerLanguageSchema } from './customer-language.schema';
import {
  SERVICE_KINDS,
  SERVICE_STATUSES,
  serviceCategoryKeySchema,
  ticketRatingSchema,
} from './service-desk.schema';

export const customerProfileSchema = z.object({
  id: idSchema,
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  /** A family member signed in on the customer's behalf (PRD 5.1); absent for the customer. */
  viewer: z.object({ name: z.string(), relation: z.string() }).nullable().optional(),
  /** The language saved on the customer record; a new phone opens in it. */
  language: customerLanguageSchema,
});
export type CustomerProfile = z.infer<typeof customerProfileSchema>;

const journeyStageSchema = z.object({
  stage: z.enum(EPC_STAGES),
  state: z.enum(['done', 'current', 'upcoming', 'skipped']),
});

const milestoneLineSchema = z.object({
  /** The plan's key (advance, before_dispatch…): the app says it in the customer's words. */
  key: z.string(),
  label: z.string(),
  payer: z.enum(['customer', 'bank']),
  amountPaise: paiseSchema,
  paidPaise: paiseSchema,
  status: z.enum(['upcoming', 'due', 'partly_paid', 'paid']),
  dueAt: instantSchema.nullable(),
  /** An open online link for what is still owed (PRD 5.3); null when there is none. */
  payUrl: z.string().nullable(),
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
  /** `key` names the milestone so apps can say it in plain words; `title` is the fallback. */
  updates: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      done: z.boolean(),
      date: calendarDateSchema,
    }),
  ),
  nextStep: z.object({ key: z.string(), title: z.string(), date: calendarDateSchema }).nullable(),
  /** Why the project is paused, when someone outside OneOhm holds it (PRD 5.2). */
  waiting: z
    .object({ party: z.enum(['customer', 'bank', 'discom']), since: calendarDateSchema })
    .nullable(),
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

/** How to reach OneOhm, from the company profile. */
export const companyContactSchema = z.object({
  name: z.string(),
  phones: z.array(z.string()),
  email: z.string(),
});

export const customerHomeSchema = z.object({
  customer: customerProfileSchema,
  projects: z.array(customerProjectSchema),
  company: companyContactSchema,
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
  /** `ordered`: their project is under way; `installed` once it is commissioned. */
  status: z.enum(['received', 'in_progress', 'ordered', 'installed', 'closed']),
  /** The reward once their project reached the qualifying event (PRD 5.6). */
  reward: z
    .object({
      status: z.enum(['pending', 'approved', 'paid', 'rejected']),
      amountPaise: z.number().int(),
      paidOn: calendarDateSchema.nullable(),
    })
    .nullable(),
  createdAt: instantSchema,
});
export type Referral = z.infer<typeof referralSchema>;

/** The categories OneOhm ships with; owners add more in Settings (service_categories). */
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
  category: serviceCategoryKeySchema,
  description: z.string().trim().min(5, 'Tell us a little more.').max(2000),
});

export const serviceRequestSchema = z.object({
  id: idSchema,
  projectCode: z.string().nullable(),
  category: serviceCategoryKeySchema,
  /** The category in the customer's words. */
  categoryLabel: z.string(),
  kind: z.enum(SERVICE_KINDS),
  /** The day of a planned maintenance visit. */
  scheduledFor: calendarDateSchema.nullable(),
  description: z.string(),
  status: z.enum(SERVICE_STATUSES),
  resolutionNote: z.string().nullable(),
  /** The customer's rating once resolved (PRD 5.5). */
  rating: ticketRatingSchema.nullable(),
  /** Photos the customer added in the app. */
  photoCount: z.number().int(),
  createdAt: instantSchema,
  resolvedAt: instantSchema.nullable(),
});
export type ServiceRequest = z.infer<typeof serviceRequestSchema>;

export const feedbackInputSchema = z.object({
  projectId: idSchema,
  rating: z.number().int().min(1).max(5),
  comment: noteSchema.optional(),
});

/** A file the customer may open: their own papers and the ones shared from their project. */
export const customerDocumentSchema = z.object({
  id: idSchema,
  name: z.string(),
  category: z.string(),
  projectCode: z.string().nullable(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
  createdAt: instantSchema,
});
export type CustomerDocument = z.infer<typeof customerDocumentSchema>;

/** A statutory report that has every detail it prints, ready to open as a PDF. */
export const customerReportSchema = z.object({
  projectId: idSchema,
  projectCode: z.string(),
  key: z.string(),
  name: z.string(),
});
export type CustomerReport = z.infer<typeof customerReportSchema>;
