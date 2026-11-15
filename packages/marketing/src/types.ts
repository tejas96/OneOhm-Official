import type { AdProvider, CampaignGoal, ConversionEvent } from '@oneohm/domain';

export type { AdProvider } from '@oneohm/domain';

/** `fetch`, passed in so tests answer for Meta and Google. */
export type Fetch = typeof fetch;

/** The ids a platform made for one campaign: kept after each step so a retry resumes, never doubles. */
export type PlatformIds = Readonly<Record<string, string>>;

/** The campaign photo or video, readable by Meta and Google. */
export interface LaunchMedia {
  readonly kind: 'image' | 'video';
  /** A public https link to the file (our `/v1/m/<id>` route). */
  readonly publicUrl: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly width: number | null;
  readonly height: number | null;
  /** The file's bytes, for platforms that take an upload (Meta images, Google image assets). */
  readonly bytes: () => Promise<Buffer>;
  /**
   * Centre crops of a photo as JPEG, for platforms that want fixed shapes (Google: 1.91:1 at
   * 1200×628 and 1:1 at 1200×1200). Null for a video.
   */
  readonly crops: {
    readonly landscape: () => Promise<Buffer>;
    readonly square: () => Promise<Buffer>;
  } | null;
}

/** Everything a platform needs to start one campaign. */
export interface LaunchInput {
  /** Our campaign code; every name made on the platform starts with it, to find it again. */
  readonly code: string;
  readonly name: string;
  readonly goal: Exclude<CampaignGoal, 'post'>;
  /** Meta only: which of its apps the business picked. */
  readonly channels: readonly ('instagram' | 'facebook')[];
  /** The text's first line (headline) and the whole text. */
  readonly headline: string;
  readonly text: string;
  readonly media: LaunchMedia;
  readonly city: {
    readonly name: string;
    readonly latitude: number | null;
    readonly longitude: number | null;
    readonly radiusKm: number;
  };
  readonly dailyBudgetPaise: number;
  /** Where a click goes: our landing page or the business's website. */
  readonly landingUrl: string;
  readonly privacyPolicyUrl: string;
  readonly businessName: string;
  /** The company logo as a square JPEG (Google needs one); null when the profile has none. */
  readonly logo: (() => Promise<Buffer>) | null;
  /** The business WhatsApp number (E.164), for Click-to-WhatsApp. */
  readonly whatsappNumber: string | null;
  /** What the chat opens with: "Hi OneOhm SOLAR-01". */
  readonly openerText: string;
  /** Lists already on the platform (ids), used as suggestions and exclusions. */
  readonly audiences: {
    readonly interested: string | null;
    readonly customers: string | null;
    readonly lookalike: string | null;
  };
  /** Google lead forms post here, with `leadFormKey`. */
  readonly leadWebhookUrl: string;
  /** What an earlier try already made. */
  readonly previous: PlatformIds;
}

export interface LaunchResult {
  readonly externalId: string;
  readonly externalIds: PlatformIds;
  readonly ads: readonly { readonly externalId: string; readonly name: string }[];
  /** New ads wait for the platform's review. */
  readonly state: 'in_review' | 'live';
  /** Plain notes for the card ("WhatsApp Status is not open for this ad account yet"). */
  readonly notes: readonly string[];
}

export type PlatformState = 'active' | 'paused' | 'stopped';

export interface AdStatus {
  readonly externalId: string;
  /** The platform's own word (ACTIVE, PENDING_REVIEW, DISAPPROVED, PAUSED…). */
  readonly status: string;
  readonly inReview: boolean;
  readonly rejected: boolean;
  /** Why it was rejected, in the platform's words. */
  readonly reason: string | null;
}

export interface SpendRow {
  /** The ad (Meta) or campaign (Google). */
  readonly externalId: string;
  /** The platform campaign it belongs to. */
  readonly campaignExternalId: string;
  readonly day: string;
  readonly spendPaise: number;
  readonly impressions: number;
  readonly clicks: number;
}

export interface Balance {
  /** Prepaid money left in paise; null for an account billed later (postpaid). */
  readonly balancePaise: number | null;
  readonly currency: string;
  /** Where the business adds money, on the platform. */
  readonly topUpUrl: string;
  /** Plain words when the account cannot run ads (disabled, unpaid, in review). */
  readonly problem: string | null;
}

/** One sale step to report, with what we know to match the person. */
export interface ConversionInput {
  /** Our row id: sent as the event id, so the platform drops a repeat. */
  readonly id: string;
  readonly event: ConversionEvent;
  readonly eventAt: Date;
  readonly valuePaise: number | null;
  readonly phoneE164: string;
  readonly email: string | null;
  readonly gclid: string | null;
  readonly fbclid: string | null;
  readonly ctwaClid: string | null;
  /** The platform's own lead form entry id (no `meta:` / `google:` prefix). */
  readonly platformLeadId: string | null;
  /** When the lead first came (for Meta's `fbc` time). */
  readonly leadCreatedAt: Date;
}

export interface ConversionOutcome {
  readonly id: string;
  /**
   * sent; skipped (never worth sending: no click, too old); failed (refused for good);
   * retry (not now, but later may work: too soon after connecting, a busy list): stays pending.
   */
  readonly status: 'sent' | 'skipped' | 'failed' | 'retry';
  readonly error?: string;
}

export interface AudienceChange {
  readonly kind: 'interested' | 'customers';
  /** The list's id when it exists already. */
  readonly externalId: string | null;
  /** Hashes from `hashPhoneFor(provider, …)`. */
  readonly add: readonly string[];
  readonly remove: readonly string[];
}

export interface AudienceResult {
  readonly externalId: string | null;
  readonly status: 'ready' | 'waiting' | 'not_allowed' | 'failed';
  readonly error?: string;
}

/**
 * One ad platform behind one shape: Meta, Google, the sandbox, and any platform added later.
 * Every call either works or throws a `PlatformError` with plain words.
 */
export interface AdPlatform {
  readonly provider: AdProvider;
  /** Makes everything paused, then switches it on last. `saveIds` keeps progress after each step. */
  launch(input: LaunchInput, saveIds: (ids: PlatformIds) => Promise<void>): Promise<LaunchResult>;
  setState(
    placement: { readonly externalId: string; readonly externalIds: PlatformIds },
    state: PlatformState,
  ): Promise<void>;
  adStatuses(adIds: readonly string[]): Promise<AdStatus[]>;
  spend(range: { readonly since: string; readonly until: string }): Promise<SpendRow[]>;
  balance(): Promise<Balance | null>;
  sendConversions(events: readonly ConversionInput[]): Promise<ConversionOutcome[]>;
  syncAudience(change: AudienceChange): Promise<AudienceResult>;
  /** Meta: a 1% lookalike of the customers list (once it is big enough); Google: nothing. */
  ensureLookalike(customersListId: string, existing: string | null): Promise<AudienceResult>;
}

/** An organic post on Instagram or Facebook. */
export interface PostInput {
  readonly channel: 'instagram' | 'facebook';
  readonly text: string;
  readonly media: LaunchMedia;
}

/** A reply in an Instagram or Facebook chat: to the person, or privately to their comment. */
export interface SocialMessage {
  readonly channel: 'instagram' | 'messenger';
  readonly recipientId: string | null;
  readonly commentId: string | null;
  readonly text: string;
}

/** A lead form entry as the platform gave it. */
export interface PlatformLead {
  readonly platformLeadId: string;
  readonly name: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly city: string | null;
  readonly adId: string | null;
  readonly campaignExternalId: string | null;
  readonly formId: string | null;
  readonly platform: 'facebook' | 'instagram' | 'google';
  readonly gclid: string | null;
  readonly createdAt: Date;
  readonly isTest: boolean;
}

/**
 * Where leads come from besides our forms (a call-tracking provider can be one later): each
 * source turns its webhook post into leads.
 */
export interface LeadSourceAdapter {
  readonly key: string;
  readLeads(body: unknown): Promise<PlatformLead[]>;
}
