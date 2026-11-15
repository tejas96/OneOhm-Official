import type { ConversionEvent } from '@oneohm/domain';
import type { Fetch, PlatformLead, PostInput, SocialMessage } from './types';

/** Meta's tokens, kept encrypted. The page token never expires; the user token may. */
export interface MetaSecrets {
  readonly userToken: string;
  readonly pageToken: string | null;
}

/** Google's refresh token, kept encrypted. */
export interface GoogleSecrets {
  readonly refreshToken: string;
}

/** A choice the business makes once, when its login sees more than one account or page. */
export interface AccountChoice {
  readonly id: string;
  readonly name: string;
  /** Extra words for the picker ("INR", "Instagram @sunpower"). */
  readonly note: string | null;
}

/** Meta ids picked or found when connecting (non-secret). */
export interface MetaDetails {
  /** A practice connection (sandbox mode); never used in live mode. */
  readonly sandbox?: boolean;
  readonly pageId?: string;
  readonly pageName?: string;
  readonly instagramId?: string;
  readonly instagramUsername?: string;
  /** The Conversions API dataset (linked to the WhatsApp account when there is one). */
  readonly datasetId?: string;
  readonly whatsappBusinessAccountId?: string;
  /** WhatsApp Status ads: unknown until the first ad tries it. */
  readonly statusPlacement?: 'unknown' | 'available' | 'not_available';
  /** When the login sees several, the ones to pick from. */
  readonly adAccountChoices?: readonly AccountChoice[];
  readonly pageChoices?: readonly AccountChoice[];
}

/** Google ids picked or made when connecting (non-secret). */
export interface GoogleDetails {
  /** A practice connection (sandbox mode); never used in live mode. */
  readonly sandbox?: boolean;
  /** The manager account the login works through, when there is one (digits). */
  readonly loginCustomerId?: string;
  /** Resource names of the conversion actions we made, by sale step. */
  readonly conversionActions?: Partial<Record<ConversionEvent, string>>;
  /** The key Google lead forms post with; made once per connection. */
  readonly leadFormKey?: string;
  /**
   * The account accepted Google's customer data terms and turned on enhanced conversions for
   * leads: only then may hashed phones and emails go with the offline conversions.
   */
  readonly enhancedConversionsForLeads?: boolean;
  readonly customerChoices?: readonly AccountChoice[];
}

/** What a Meta client needs, decrypted. */
export interface MetaAccess {
  readonly userToken: string;
  readonly pageToken: string | null;
  /** `act_<id>`. */
  readonly adAccountId: string;
  readonly currency: string;
  readonly details: MetaDetails;
}

/** What a Google client needs, decrypted. */
export interface GoogleAccess {
  readonly refreshToken: string;
  /** Digits only. */
  readonly customerId: string;
  readonly currency: string;
  readonly details: GoogleDetails;
}

/** The Meta app OneOhm uses (Facebook Login for Business). */
export interface MetaAppConfig {
  readonly appId: string;
  readonly appSecret: string;
  readonly graphVersion: string;
  /** Facebook Login for Business configuration id; plain scopes are asked when empty. */
  readonly loginConfigId: string | null;
  readonly fetch: Fetch;
}

/** The Google Cloud OAuth client and the Google Ads developer token. */
export interface GoogleAppConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly developerToken: string;
  readonly apiVersion: string;
  readonly fetch: Fetch;
}

/** Meta calls that are not about ads: posts, chat replies, lead form entries, names. */
export interface MetaTools {
  publishPost(
    input: PostInput,
  ): Promise<{ readonly postId: string; readonly permalink: string | null }>;
  sendMessage(message: SocialMessage): Promise<{ readonly messageId: string }>;
  readLead(leadgenId: string): Promise<PlatformLead>;
  /** The person's name (Facebook) or @username (Instagram), or null. */
  profileName(channel: 'instagram' | 'messenger', userId: string): Promise<string | null>;
}
