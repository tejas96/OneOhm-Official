import { AD_PROVIDERS, CONVERSION_EVENTS } from '@oneohm/domain';
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, instant, money, primaryId, updatedAt } from './columns';
import { customers, leads } from './crm.schema';
import { marketingCampaigns } from './marketing.schema';
import { projects } from './projects.schema';
import { outbox } from './records.schema';

/** One sale step of an ad lead, told to one platform once (Meta CAPI, Google offline). */
export const marketingConversions = pgTable(
  'marketing_conversions',
  {
    id: primaryId(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    event: text('event', { enum: CONVERSION_EVENTS }).notNull(),
    provider: text('provider', { enum: AD_PROVIDERS }).notNull(),
    status: text('status', { enum: ['pending', 'sent', 'skipped', 'failed'] })
      .notNull()
      .default('pending'),
    valuePaise: money('value_paise'),
    /** When the step happened (as best known); platforms want it within their window. */
    eventAt: instant('event_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    sentAt: instant('sent_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('marketing_conversions_unique').on(table.leadId, table.event, table.provider),
    index('marketing_conversions_status_idx').on(table.status),
  ],
);

/** The lists OneOhm keeps on Meta and Google (retarget, exclude, lookalike seed). */
export const marketingAudiences = pgTable(
  'marketing_audiences',
  {
    provider: text('provider', { enum: AD_PROVIDERS }).notNull(),
    kind: text('kind', { enum: ['interested', 'customers', 'lookalike'] }).notNull(),
    externalId: text('external_id'),
    size: integer('size').notNull().default(0),
    /** ready, waiting (too few people yet), not_allowed (the account cannot use lists yet). */
    status: text('status', { enum: ['ready', 'waiting', 'not_allowed', 'failed'] })
      .notNull()
      .default('waiting'),
    lastError: text('last_error'),
    syncedAt: instant('synced_at'),
  },
  (table) => [primaryKey({ columns: [table.provider, table.kind] })],
);

/** The phone hashes already on a list, so only changes are sent. */
export const marketingAudienceMembers = pgTable(
  'marketing_audience_members',
  {
    provider: text('provider', { enum: AD_PROVIDERS }).notNull(),
    kind: text('kind', { enum: ['interested', 'customers'] }).notNull(),
    hash: text('hash').notNull(),
    addedAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.provider, table.kind, table.hash] })],
);

/** A WhatsApp campaign message to one of the business's own contacts. */
export const marketingMessages = pgTable(
  'marketing_messages',
  {
    id: primaryId(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => marketingCampaigns.id, { onDelete: 'cascade' }),
    phoneE164: text('phone_e164').notNull(),
    segment: text('segment').notNull(),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    outboxId: uuid('outbox_id').references(() => outbox.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('marketing_messages_campaign_phone_unique').on(table.campaignId, table.phoneE164),
  ],
);

/** A visit to a campaign's landing page, with the ad click ids it carried. */
export const marketingClicks = pgTable(
  'marketing_clicks',
  {
    id: primaryId(),
    /** Short random reference carried in the WhatsApp opener, to tie the chat to this click. */
    ref: text('ref').notNull(),
    campaignId: uuid('campaign_id').references(() => marketingCampaigns.id, {
      onDelete: 'cascade',
    }),
    gclid: text('gclid'),
    fbclid: text('fbclid'),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('marketing_clicks_ref_unique').on(table.ref)],
);

/** A Google review of the business, as read from Google. */
export const marketingReviews = pgTable(
  'marketing_reviews',
  {
    id: primaryId(),
    externalId: text('external_id').notNull(),
    author: text('author').notNull(),
    rating: integer('rating').notNull(),
    text: text('text').notNull().default(''),
    publishedAt: instant('published_at'),
    /** When someone opened Marketing after it arrived; null shows it as new. */
    seenAt: instant('seen_at'),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('marketing_reviews_external_unique').on(table.externalId)],
);

/** Each finished project asked once for a Google review (or skipped: older than the feature). */
export const marketingReviewRequests = pgTable('marketing_review_requests', {
  projectId: uuid('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['asked', 'skipped'] }).notNull(),
  outboxId: uuid('outbox_id').references(() => outbox.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

/** Webhook events already handled (Meta lead, comment, message; Google lead), by key. */
export const marketingEvents = pgTable('marketing_events', {
  key: text('key').primaryKey(),
  receivedAt: createdAt(),
});

/** When each worker marketing job last ran, so hourly and daily parts keep their pace. */
export const marketingJobs = pgTable('marketing_jobs', {
  key: text('key').primaryKey(),
  ranAt: instant('ran_at').notNull(),
  lastError: text('last_error'),
  /** What the job learnt for the screens (the Google rating and review count). */
  data: jsonb('data'),
  updatedAt: updatedAt(),
});
