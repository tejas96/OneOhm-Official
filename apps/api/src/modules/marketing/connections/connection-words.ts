import type { MarketingConnection, MarketingTemplate } from '@oneohm/api-contracts';
import type { AccountChoice, ConnectionRow, GoogleDetails, MetaDetails } from '@oneohm/marketing';

/** What each Meta permission lets OneOhm do, in plain words. */
const PERMISSION_WORDS: Readonly<Record<string, string>> = {
  ads_management: 'Make and change ads',
  ads_read: 'Read ad results and spending',
  business_management: 'Find your ad account',
  pages_show_list: 'See your Facebook pages',
  pages_read_engagement: 'Read your page and its comments',
  pages_manage_ads: 'Run ads from your page',
  pages_manage_metadata: 'Receive new leads and messages',
  pages_manage_posts: 'Post on your Facebook page',
  pages_messaging: 'Reply to Instagram and Facebook messages',
  leads_retrieval: 'Receive leads from Meta lead forms',
  instagram_basic: 'See your Instagram account',
  instagram_content_publish: 'Post on Instagram',
  instagram_manage_messages: 'Reply to Instagram messages',
  instagram_manage_comments: 'Reply to Instagram comments',
  whatsapp_business_management: 'Manage your WhatsApp messages',
  whatsapp_business_messaging: 'Send WhatsApp messages',
};

/** A missing Meta permission in plain words; an unknown one is made readable. */
export function permissionWords(permission: string): string {
  const known = PERMISSION_WORDS[permission];
  if (known) return known;
  const text = permission.replace(/_/g, ' ').trim();
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : permission;
}

/** Permissions that stop ads, the page or messages from working until Meta grants them. */
export const needsReview = (permission: string): boolean =>
  /^(ads_|pages_|instagram_|leads_|whatsapp_)/.test(permission);

export const GOOGLE_WAITING = 'Google Ads developer token approval';

const act = (id: string) => id.replace(/^act_/, '');

/** Meta's page to add money to the ad account. */
export const metaTopUpUrl = (accountId: string | null): string | null =>
  accountId
    ? `https://business.facebook.com/billing_hub/payment_settings/?asset_id=${act(accountId)}`
    : null;

export const GOOGLE_BILLING_URL = 'https://ads.google.com/aw/billing/summary';

const iso = (value: Date | null) => (value ? value.toISOString() : null);

/** The sign-in choices still open: only while no account is picked. */
function choiceOf(
  row: ConnectionRow,
  details: MetaDetails & GoogleDetails,
): MarketingConnection['choose'] {
  if (row.status !== 'needs_attention' || row.accountId) return null;
  const accounts: readonly AccountChoice[] =
    row.provider === 'meta' ? (details.adAccountChoices ?? []) : (details.customerChoices ?? []);
  const pages = row.provider === 'meta' ? (details.pageChoices ?? []) : [];
  if (accounts.length === 0 && pages.length === 0) return null;
  return { accounts: [...accounts], pages: [...pages] };
}

const NOT_CONNECTED = {
  accountName: null,
  extra: null,
  waitingFor: [],
  choose: null,
  lastError: null,
  connectedAt: null,
  tokenExpiresAt: null,
  balancePaise: null,
  topUpUrl: null,
} as const;

/** Page and Instagram for Meta ("Sun Power · @sunpower"). */
function extraOf(provider: 'meta' | 'google', details: MetaDetails): string | null {
  if (provider !== 'meta' || !details.pageName) return null;
  const handle = details.instagramUsername ? `@${details.instagramUsername}` : null;
  return [details.pageName, handle].filter(Boolean).join(' · ');
}

function topUpOf(provider: 'meta' | 'google', accountId: string | null): string | null {
  if (!accountId) return null;
  return provider === 'meta' ? metaTopUpUrl(accountId) : GOOGLE_BILLING_URL;
}

/**
 * Meta or Google as Connections shows it. No row, or a disconnected one, reads "not connected".
 * Settings the server lacks only show in live mode.
 */
export function connectionView(
  provider: 'meta' | 'google',
  row: ConnectionRow | null,
  missingSettings: readonly string[],
): MarketingConnection {
  if (!row || row.status === 'disconnected')
    return {
      provider,
      status: 'not_connected',
      missingSettings: [...missingSettings],
      ...NOT_CONNECTED,
      waitingFor: [],
    };
  const details = row.details as MetaDetails & GoogleDetails;
  return {
    provider,
    status: row.status,
    accountName: row.accountName
      ? [row.accountName, row.currency].filter(Boolean).join(' · ')
      : null,
    extra: extraOf(provider, details),
    missingSettings: [...missingSettings],
    waitingFor: provider === 'meta' ? row.missing.map(permissionWords) : [...row.missing],
    choose: choiceOf(row, details),
    lastError: row.lastError,
    connectedAt: iso(row.connectedAt),
    tokenExpiresAt: iso(row.tokenExpiresAt),
    balancePaise: row.balancePaise,
    topUpUrl: topUpOf(provider, row.accountId),
  };
}

/** What we know of a template at Meta: its word, or nothing (not found / not asked). */
export type MetaKnows = {
  readonly status: 'approved' | 'pending' | 'rejected' | 'not_sent';
  readonly reason: string | null;
} | null;

/**
 * One WhatsApp marketing message. `asked` is false when Meta was not asked (practice mode or
 * WhatsApp not set up); `failed` is true when the ask did not work.
 */
export function templateView(
  row: { key: string; metaName: string; preview: string; active: boolean },
  meta: { readonly asked: boolean; readonly failed: boolean; readonly known: MetaKnows },
  sandbox: boolean,
): MarketingTemplate {
  let approval: MarketingTemplate['approval'] = 'unknown';
  if (sandbox) approval = row.active ? 'approved' : 'not_sent';
  else if (meta.asked) approval = meta.failed ? 'unknown' : (meta.known?.status ?? 'not_sent');
  return {
    key: row.key,
    preview: row.preview,
    metaName: row.metaName,
    active: row.active,
    approval,
    rejectedReason: approval === 'rejected' ? (meta.known?.reason ?? null) : null,
  };
}

/** "A", "A and B", "A, B and C": for sentences that name settings. */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The sentence shown when Connect cannot start because the server lacks app keys. */
export const missingSettingsWords = (missing: readonly string[]): string =>
  `Add ${listWords(missing)} to the server settings first.`;

/** Marketing → Connections on the web, with what just happened. */
export function connectionsUrl(
  webBaseUrl: string,
  result: { readonly connected: string } | { readonly error: string },
): string {
  const query =
    'connected' in result
      ? `connected=${encodeURIComponent(result.connected)}`
      : `error=${encodeURIComponent(result.error)}`;
  return `${webBaseUrl.replace(/\/$/, '')}/marketing?tab=connections&${query}`;
}
