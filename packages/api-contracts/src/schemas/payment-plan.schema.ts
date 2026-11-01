import { CUSTOMER_TRIGGERS } from '@oneohm/domain';
import { z } from 'zod';
import { idSchema } from '../common/primitives';

const stepSchema = z.object({
  key: z.string(),
  label: z.string(),
  shareBp: z.number().int(),
  trigger: z.enum(CUSTOMER_TRIGGERS),
});

/** Named payment terms: customer milestones as shares of the price (PRD 3.7, 7.2). */
export const paymentPlanSchema = z.object({
  id: idSchema,
  name: z.string(),
  steps: z.array(stepSchema),
  isDefault: z.boolean(),
  active: z.boolean(),
});
export type PaymentPlan = z.infer<typeof paymentPlanSchema>;

export const paymentPlanInputSchema = z.object({
  name: z.string().trim().min(3, 'Name the plan.').max(80),
  steps: z
    .array(
      z.object({
        label: z.string().trim().max(80),
        shareBp: z.number().int().min(0).max(10_000),
        trigger: z.enum(CUSTOMER_TRIGGERS),
      }),
    )
    .max(8),
  active: z.boolean(),
});
export type PaymentPlanInput = z.infer<typeof paymentPlanInputSchema>;
