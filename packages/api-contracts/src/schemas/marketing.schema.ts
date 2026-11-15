import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_GOALS,
  CAMPAIGN_LOOKS,
  CAMPAIGN_STATES,
  MESSAGE_SEGMENTS,
  PLACEMENT_STATES,
} from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema, paiseSchema } from '../common/primitives';

export const campaignGoalSchema = z.enum(CAMPAIGN_GOALS);
export const campaignChannelSchema = z.enum(CAMPAIGN_CHANNELS);
export const messageSegmentSchema = z.enum(MESSAGE_SEGMENTS);

/** The numbers every campaign card shows. Spent and costs are null before any spend is read. */
export const campaignNumbersSchema = z.object({
  spentPaise: paiseSchema,
  leads: z.number().int(),
  sales: z.number().int(),
  salesValuePaise: paiseSchema,
  costPerLeadPaise: paiseSchema.nullable(),
  costPerSalePaise: paiseSchema.nullable(),
  /** WhatsApp messages sent and read, for campaigns that message own contacts. */
  messagesSent: z.number().int(),
  messagesRead: z.number().int(),
});
export type CampaignNumbers = z.infer<typeof campaignNumbersSchema>;

/** One platform's part of a campaign. */
export const campaignPlacementSchema = z.object({
  provider: z.enum(['meta', 'google', 'whatsapp']),
  state: z.enum(PLACEMENT_STATES),
  dailyBudgetPaise: paiseSchema,
  notes: z.array(z.string()),
  /** Plain words when it failed, with what to do. */
  error: z.string().nullable(),
});
export type CampaignPlacement = z.infer<typeof campaignPlacementSchema>;

export const campaignCardSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  goal: campaignGoalSchema,
  state: z.enum(CAMPAIGN_STATES),
  look: z.enum(CAMPAIGN_LOOKS),
  channels: z.array(campaignChannelSchema),
  city: z.string(),
  dailyBudgetPaise: paiseSchema,
  /** A small preview of the photo (or the video's file), as an API path. */
  mediaUrl: z.string().nullable(),
  mediaKind: z.enum(['image', 'video']).nullable(),
  text: z.string(),
  startsAt: instantSchema.nullable(),
  launchedAt: instantSchema.nullable(),
  createdAt: instantSchema,
  numbers: campaignNumbersSchema,
  placements: z.array(campaignPlacementSchema),
  actions: z.object({ pause: z.boolean(), stop: z.boolean(), runAgain: z.boolean() }),
});
export type CampaignCard = z.infer<typeof campaignCardSchema>;

export const campaignDetailSchema = campaignCardSchema.extend({
  /** The landing page link, for sharing; null for posts. */
  landingUrl: z.string().nullable(),
  /** What people type on WhatsApp after seeing a poster: "Hi OneOhm SOLAR-01". */
  opener: z.string(),
  segments: z.array(messageSegmentSchema),
  days: z.array(
    z.object({ day: calendarDateSchema, spentPaise: paiseSchema, leads: z.number().int() }),
  ),
  leads: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      city: z.string(),
      stage: z.string(),
      createdAt: instantSchema,
    }),
  ),
});
export type CampaignDetail = z.infer<typeof campaignDetailSchema>;

/** An older code made by hand (posters, flyers), still counted. */
export const codeCardSchema = z.object({
  code: z.string(),
  name: z.string(),
  active: z.boolean(),
  leads: z.number().int(),
  sales: z.number().int(),
});
export type CodeCard = z.infer<typeof codeCardSchema>;

export const marketingAlertSchema = z.object({
  kind: z.enum(['no_leads', 'low_balance', 'reconnect', 'account_problem', 'needs_attention']),
  title: z.string(),
  body: z.string(),
  /** An outside link (top up) or an in-app path. */
  href: z.string().nullable(),
  campaignId: idSchema.nullable(),
});
export type MarketingAlert = z.infer<typeof marketingAlertSchema>;

export const marketingReviewSchema = z.object({
  id: idSchema,
  author: z.string(),
  rating: z.number().int(),
  text: z.string(),
  publishedAt: instantSchema.nullable(),
  isNew: z.boolean(),
});
export type MarketingReview = z.infer<typeof marketingReviewSchema>;

export const marketingOverviewSchema = z.object({
  mode: z.enum(['live', 'sandbox']),
  /** Meta and Google in one word each, for the header chips. */
  connections: z.object({
    meta: z.enum(['connected', 'in_review', 'needs_attention', 'not_connected']),
    google: z.enum(['connected', 'in_review', 'needs_attention', 'not_connected']),
  }),
  campaigns: z.array(campaignCardSchema),
  codes: z.array(codeCardSchema),
  referral: z
    .object({
      active: z.boolean(),
      leads: z.number().int(),
      sales: z.number().int(),
      rewardsPaise: paiseSchema,
    })
    .nullable(),
  alerts: z.array(marketingAlertSchema),
  reviews: z.object({
    rating: z.number().nullable(),
    total: z.number().int(),
    newCount: z.number().int(),
    latest: z.array(marketingReviewSchema),
    asked: z.number().int(),
  }),
  /** The last 30 days across every campaign. */
  totals: z.object({
    spentPaise: paiseSchema,
    leads: z.number().int(),
    sales: z.number().int(),
    costPerSalePaise: paiseSchema.nullable(),
  }),
});
export type MarketingOverview = z.infer<typeof marketingOverviewSchema>;

export const newCampaignInputSchema = z.object({
  goal: campaignGoalSchema,
  text: z.string().trim().min(3, 'Write a few words about your offer.').max(2000),
  mediaId: idSchema,
  channels: z.array(campaignChannelSchema).min(1, 'Pick at least one place.'),
  city: z.string().trim().min(2, 'Pick a city.').max(80),
  dailyBudgetPaise: paiseSchema.nonnegative(),
  segments: z.array(messageSegmentSchema).default([]),
  /** A post for later; null or missing goes now. */
  startsAt: instantSchema.nullable().optional(),
});
export type NewCampaignInput = z.infer<typeof newCampaignInputSchema>;

export const marketingMediaSchema = z.object({
  id: idSchema,
  kind: z.enum(['image', 'video']),
  url: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});
export type MarketingMedia = z.infer<typeof marketingMediaSchema>;

export const waitingAdLeadsSchema = z.object({
  count: z.number().int(),
  leads: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      city: z.string(),
      campaign: z.string(),
      createdAt: instantSchema,
    }),
  ),
});
export type WaitingAdLeads = z.infer<typeof waitingAdLeadsSchema>;
