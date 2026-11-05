import { SURVEY_ITEMS } from '@oneohm/domain';
import { z } from 'zod';
import { idSchema, instantSchema } from '../common/primitives';

export const surveyItemSchema = z.enum(SURVEY_ITEMS);

/** The self site survey of a survey step, for the engineer's check (redesign §7). */
export const selfSurveyViewSchema = z.object({
  id: idSchema,
  /** `open` = with the customer, `received` = waiting for the check, `closed` = approved. */
  status: z.enum(['open', 'received', 'closed', 'cancelled']),
  startedAt: instantSchema.nullable(),
  sentAt: instantSchema.nullable(),
  /** What the customer was offered, in paise (0 when no discount). */
  offerPaise: z.number().int(),
  /** The discount really taken off a payment, in paise; null before approval or when none could be. */
  creditPaise: z.number().int().nullable(),
  /** The customer's answers as words (label, value). */
  answers: z.array(z.object({ item: surveyItemSchema, label: z.string(), value: z.string() })),
  photos: z.array(
    z.object({ item: surveyItemSchema, label: z.string(), documentId: idSchema, name: z.string() }),
  ),
  /** What the customer has not given yet. */
  missing: z.array(surveyItemSchema),
  /** The items asked again and not answered yet. */
  askAgain: z.array(surveyItemSchema),
  /** Which choices the team has: ask again and book a visit only while the survey waits for the check. */
  canCheck: z.boolean(),
});
export type SelfSurveyView = z.infer<typeof selfSurveyViewSchema>;

export const askSurveyAgainSchema = z.object({
  items: z.array(surveyItemSchema).min(1).max(SURVEY_ITEMS.length),
});
export type AskSurveyAgain = z.infer<typeof askSurveyAgainSchema>;

export const selfSurveyQuerySchema = z.object({ taskId: idSchema });

/** A self-survey discount of a project: where it is, in paise (GST inclusive). */
export const surveyCreditSchema = z.object({
  id: idSchema,
  amountPaise: z.number().int(),
  status: z.enum(['pending', 'applied', 'reversed', 'paid_out']),
  /** The payment it was taken off, when applied. */
  milestoneLabel: z.string().nullable(),
  settleNote: z.string().nullable(),
  createdAt: instantSchema,
});
export type SurveyCredit = z.infer<typeof surveyCreditSchema>;

export const settleSurveyCreditSchema = z.object({ reason: z.string().trim().min(3).max(300) });
