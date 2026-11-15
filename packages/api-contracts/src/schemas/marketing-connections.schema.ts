import { CAMPAIGN_GOALS } from '@oneohm/domain';
import { z } from 'zod';
import { instantSchema, paiseSchema } from '../common/primitives';
import { campaignChannelSchema, messageSegmentSchema } from './marketing.schema';

export const connectionStatusSchema = z.enum([
  'connected',
  'in_review',
  'needs_attention',
  'not_connected',
]);

export const accountChoiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  note: z.string().nullable(),
});

/** Meta or Google as Connections shows it. */
export const connectionSchema = z.object({
  provider: z.enum(['meta', 'google']),
  status: connectionStatusSchema,
  /** The ad account in words ("Sun Power Ads · INR"), when connected. */
  accountName: z.string().nullable(),
  /** Page and Instagram for Meta ("Sun Power · @sunpower"). */
  extra: z.string().nullable(),
  /** Settings the server still needs (env names) before Connect can work. */
  missingSettings: z.array(z.string()),
  /** Approvals or permissions the platform has not granted yet. */
  waitingFor: z.array(z.string()),
  /** A choice to make once (several ad accounts or pages). */
  choose: z
    .object({
      accounts: z.array(accountChoiceSchema),
      pages: z.array(accountChoiceSchema),
    })
    .nullable(),
  lastError: z.string().nullable(),
  connectedAt: instantSchema.nullable(),
  tokenExpiresAt: instantSchema.nullable(),
  balancePaise: paiseSchema.nullable(),
  topUpUrl: z.string().nullable(),
});
export type MarketingConnection = z.infer<typeof connectionSchema>;

/** A WhatsApp marketing message and where Meta's approval stands. */
export const marketingTemplateSchema = z.object({
  key: z.string(),
  preview: z.string(),
  metaName: z.string(),
  active: z.boolean(),
  approval: z.enum(['approved', 'pending', 'rejected', 'not_sent', 'unknown']),
  rejectedReason: z.string().nullable(),
});
export type MarketingTemplate = z.infer<typeof marketingTemplateSchema>;

export const marketingSettingsSchema = z.object({
  defaultDailyBudgetPaise: paiseSchema.min(10_000, 'Use at least ₹100 a day.'),
  defaultCity: z.string().trim().max(80),
  radiusKm: z.number().int().min(1).max(80),
  noLeadAlertDays: z.number().int().min(1).max(30),
  lowBalancePaise: paiseSchema.nonnegative(),
  websiteUrl: z.string().trim().max(300),
  privacyPolicyUrl: z.string().trim().max(300),
  googlePlaceId: z.string().trim().max(300),
  askForReviews: z.boolean(),
});
export type MarketingSettingsRecord = z.infer<typeof marketingSettingsSchema>;

export const marketingConnectionsSchema = z.object({
  mode: z.enum(['live', 'sandbox']),
  meta: connectionSchema,
  google: connectionSchema,
  whatsapp: z.object({
    /** The WhatsApp Cloud API is set up on the server. */
    ready: z.boolean(),
    templates: z.array(marketingTemplateSchema),
  }),
  settings: marketingSettingsSchema,
  /** The business found on Google Maps, for reviews. */
  place: z.object({ id: z.string(), name: z.string(), address: z.string() }).nullable(),
});
export type MarketingConnections = z.infer<typeof marketingConnectionsSchema>;

export const placeChoiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
});

export const segmentCountSchema = z.object({
  segment: messageSegmentSchema,
  /** People who would get it now (STOP and unreachable numbers left out). */
  count: z.number().int(),
});

/** What the New campaign screen starts with. */
export const campaignDefaultsSchema = z.object({
  mode: z.enum(['live', 'sandbox']),
  goal: z.enum(CAMPAIGN_GOALS),
  channels: z.array(campaignChannelSchema),
  city: z.string(),
  dailyBudgetPaise: paiseSchema,
  /** Recent lead cities, most common first, for the city picker. */
  cities: z.array(z.string()),
  segments: z.array(segmentCountSchema),
  /** Which places can run now; the screen greys out the rest with the reason. */
  ready: z.object({
    instagram: z.boolean(),
    facebook: z.boolean(),
    google: z.boolean(),
    whatsapp: z.boolean(),
  }),
  /** Why a place cannot run now, by channel. */
  why: z.record(z.string(), z.string()),
  defaultSegments: z.array(messageSegmentSchema),
});
export type CampaignDefaults = z.infer<typeof campaignDefaultsSchema>;
