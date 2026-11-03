import { z } from 'zod';

/** An ad or campaign code the owner uses to tell where leads come from. */
export const leadCampaignSchema = z.object({
  code: z.string(),
  name: z.string(),
  active: z.boolean(),
  /** Leads that arrived with this code. */
  leads: z.number().int(),
});
export type LeadCampaignRecord = z.infer<typeof leadCampaignSchema>;

/** Uppercase letters, digits, dash and underscore; typed in any case, stored uppercase. */
export const leadCampaignCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{2,20}$/, 'Use 2 to 20 letters, digits, dashes or underscores.');

export const leadCampaignInputSchema = z.object({
  code: leadCampaignCodeSchema,
  name: z.string().trim().min(2, 'Name the campaign.').max(60),
});

export const leadCampaignUpdateSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  active: z.boolean().optional(),
});
