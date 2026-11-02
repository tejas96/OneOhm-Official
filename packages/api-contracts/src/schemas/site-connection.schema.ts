import { z } from 'zod';
import { consumerNumberSchema, idSchema } from '../common/primitives';

/**
 * A site's electricity connection as the field app captures it (PRD 4.2, 4.5): the
 * consumer number from the bill and the DISCOM that supplies it.
 */
export const siteConnectionSchema = z.object({
  propertyId: idSchema,
  label: z.string(),
  addressLine: z.string(),
  city: z.string(),
  consumerNumber: z.string().nullable(),
  /** The site's DISCOM; on a task, the project's when the site has none yet. */
  discomId: idSchema.nullable(),
  /** The DISCOM is saved on the site itself (captured or confirmed), not only assumed. */
  confirmed: z.boolean(),
});
export type SiteConnection = z.infer<typeof siteConnectionSchema>;

/** At the lead stage both can be noted; either may be cleared. */
export const leadConnectionInputSchema = z.object({
  consumerNumber: consumerNumberSchema.nullable().optional(),
  discomId: idSchema.nullable().optional(),
});
export type LeadConnectionInput = z.infer<typeof leadConnectionInputSchema>;

/** On the electricity-details task the DISCOM is confirmed or changed. */
export const taskConnectionInputSchema = z.object({ discomId: idSchema });
export type TaskConnectionInput = z.infer<typeof taskConnectionInputSchema>;
