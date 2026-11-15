import { AD_PROVIDERS, CAMPAIGN_GOALS, CAMPAIGN_STATES, PLACEMENT_STATES } from '@oneohm/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { calendarDate, createdAt, instant, money, primaryId, updatedAt, version } from './columns';
import { users } from './identity.schema';
import { leadCampaigns } from './lead-campaigns.schema';

/**
 * Meta or Google, connected once by the business (its own ad accounts; it pays them directly).
 * Tokens are encrypted (`secrets`, AES-256-GCM); `details` holds the non-secret ids picked.
 */
export const marketingConnections = pgTable('marketing_connections', {
  provider: text('provider', { enum: AD_PROVIDERS }).primaryKey(),
  /** connected, in_review (the platform is still approving us), needs_attention, disconnected. */
  status: text('status', {
    enum: ['connected', 'in_review', 'needs_attention', 'disconnected'],
  }).notNull(),
  /** Encrypted JSON of the access, refresh and page tokens. */
  secrets: text('secrets'),
  /** The ad account (Meta `act_…`, Google customer id) the business picked. */
  accountId: text('account_id'),
  accountName: text('account_name'),
  currency: text('currency'),
  /** Provider ids: page, Instagram account, dataset, WhatsApp account, conversion actions. */
  details: jsonb('details').notNull().default({}),
  /** What the platform has not granted yet, in its own words (missing permissions). */
  missing: text('missing').array().notNull().default(sql`'{}'::text[]`),
  tokenExpiresAt: instant('token_expires_at'),
  lastError: text('last_error'),
  /** Prepaid balance left, in paise, as last read (null when the account is postpaid). */
  balancePaise: money('balance_paise'),
  balanceCheckedAt: instant('balance_checked_at'),
  connectedByUserId: uuid('connected_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  connectedAt: instant('connected_at'),
  updatedAt: updatedAt(),
});

/** A campaign photo or video, kept in object storage. Public by design: it is an ad. */
export const marketingMedia = pgTable('marketing_media', {
  id: primaryId(),
  storageKey: text('storage_key').notNull(),
  kind: text('kind', { enum: ['image', 'video'] }).notNull(),
  contentType: text('content_type').notNull(),
  fileName: text('file_name').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  width: integer('width'),
  height: integer('height'),
  uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: createdAt(),
});

/** One campaign as the business made it: one photo or video, one text, several places. */
export const marketingCampaigns = pgTable(
  'marketing_campaigns',
  {
    id: primaryId(),
    /** Its code on the Ad and campaign codes list; leads and reports join on it. */
    code: text('code')
      .notNull()
      .references(() => leadCampaigns.code, { onUpdate: 'cascade' }),
    name: text('name').notNull(),
    goal: text('goal', { enum: CAMPAIGN_GOALS }).notNull(),
    state: text('state', { enum: CAMPAIGN_STATES }).notNull().default('launching'),
    text: text('text').notNull(),
    mediaId: uuid('media_id').references(() => marketingMedia.id, { onDelete: 'set null' }),
    /** instagram, facebook, google, whatsapp. */
    channels: text('channels').array().notNull(),
    city: text('city').notNull(),
    dailyBudgetPaise: money('daily_budget_paise').notNull().default(0),
    /** Who gets the WhatsApp message (MESSAGE_SEGMENTS). */
    segments: text('segments').array().notNull().default(sql`'{}'::text[]`),
    /** A post set for later; null goes now. */
    startsAt: instant('starts_at'),
    /** The campaign this one was run again from. */
    copiedFromId: uuid('copied_from_id'),
    lastError: text('last_error'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    launchedAt: instant('launched_at'),
    stoppedAt: instant('stopped_at'),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('marketing_campaigns_code_unique').on(table.code),
    index('marketing_campaigns_state_idx').on(table.state),
  ],
);

/** A campaign's part on one platform: what we made there and how it stands. */
export const marketingPlacements = pgTable(
  'marketing_placements',
  {
    id: primaryId(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => marketingCampaigns.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['meta', 'google', 'whatsapp'] }).notNull(),
    state: text('state', { enum: PLACEMENT_STATES }).notNull().default('pending'),
    /** The platform's campaign id (Meta campaign, Google campaign). */
    externalId: text('external_id'),
    /** Every other id made there (ad set, creative, form, post, budget), to resume or undo. */
    externalIds: jsonb('external_ids').notNull().default({}),
    dailyBudgetPaise: money('daily_budget_paise').notNull().default(0),
    /** Plain notes such as "WhatsApp Status is not open for this ad account yet". */
    notes: text('notes').array().notNull().default(sql`'{}'::text[]`),
    lastError: text('last_error'),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('marketing_placements_campaign_provider_unique').on(
      table.campaignId,
      table.provider,
    ),
  ],
);

/** An ad on Meta or Google, so a webhook or a spend row finds its campaign. */
export const marketingAds = pgTable(
  'marketing_ads',
  {
    provider: text('provider', { enum: AD_PROVIDERS }).notNull(),
    externalId: text('external_id').notNull(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => marketingCampaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** As the platform last said: ACTIVE, PAUSED, PENDING_REVIEW, DISAPPROVED… */
    reviewStatus: text('review_status'),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.externalId] }),
    index('marketing_ads_campaign_idx').on(table.campaignId),
  ],
);

/** Spend per platform, ad and day, as pulled from Meta and Google (paise). */
export const marketingSpendDays = pgTable(
  'marketing_spend_days',
  {
    provider: text('provider', { enum: AD_PROVIDERS }).notNull(),
    /** The ad (Meta) or campaign (Google) the row is for. */
    externalId: text('external_id').notNull(),
    day: calendarDate('day').notNull(),
    campaignId: uuid('campaign_id').references(() => marketingCampaigns.id, {
      onDelete: 'set null',
    }),
    spendPaise: money('spend_paise').notNull().default(0),
    impressions: bigint('impressions', { mode: 'number' }).notNull().default(0),
    clicks: bigint('clicks', { mode: 'number' }).notNull().default(0),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.externalId, table.day] }),
    index('marketing_spend_days_campaign_idx').on(table.campaignId, table.day),
  ],
);
