import type { AccountChoice, MetaAppConfig } from '../access';
import { PlatformError } from '../errors';
import { createGraph, metaGraph } from './meta-graph';

/** The permissions OneOhm asks Meta for. */
export const META_SCOPES: readonly string[] = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_manage_ads',
  'pages_manage_posts',
  'pages_messaging',
  'leads_retrieval',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_messages',
  'instagram_manage_comments',
  'whatsapp_business_management',
];

/** The Meta sign-in page (Facebook Login for Business); `state` comes back to the callback. */
export function metaLoginUrl(
  app: MetaAppConfig,
  options: { readonly redirectUri: string; readonly state: string },
): string {
  const params = new URLSearchParams({
    client_id: app.appId,
    redirect_uri: options.redirectUri,
    state: options.state,
    response_type: 'code',
  });
  if (app.loginConfigId) params.set('config_id', app.loginConfigId);
  else params.set('scope', META_SCOPES.join(','));
  return `https://www.facebook.com/${app.graphVersion}/dialog/oauth?${params.toString()}`;
}

interface TokenReply {
  readonly access_token: string;
  readonly expires_in?: number;
}

/** Swaps the sign-in code for a long-lived user token. */
export async function metaExchangeCode(
  app: MetaAppConfig,
  code: string,
  redirectUri: string,
): Promise<{ readonly userToken: string; readonly expiresAt: Date | null }> {
  const graph = createGraph({ fetch: app.fetch, version: app.graphVersion, token: null });
  const short = await graph.get<TokenReply>('oauth/access_token', {
    client_id: app.appId,
    client_secret: app.appSecret,
    redirect_uri: redirectUri,
    code,
  });
  const long = await graph.get<TokenReply>('oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: app.appId,
    client_secret: app.appSecret,
    fb_exchange_token: short.access_token,
  });
  const seconds = long.expires_in;
  return {
    userToken: long.access_token,
    expiresAt: seconds && seconds > 0 ? new Date(Date.now() + seconds * 1000) : null,
  };
}

export interface MetaPageChoice extends AccountChoice {
  readonly pageToken: string;
  readonly instagramId: string | null;
  readonly instagramUsername: string | null;
}

export interface MetaAdAccountChoice extends AccountChoice {
  readonly currency: string;
  /** Meta's account_status: 1 active, 2 disabled, 3 unsettled, 7 pending review, 9 grace… */
  readonly accountStatus: number;
}

/** What the token can reach, and which asked permissions Meta has not granted. */
export async function metaDiscover(
  app: MetaAppConfig,
  userToken: string,
): Promise<{
  readonly adAccounts: readonly MetaAdAccountChoice[];
  readonly pages: readonly MetaPageChoice[];
  readonly missing: readonly string[];
}> {
  const graph = metaGraph(app, userToken);
  const [accounts, pages, permissions] = await Promise.all([
    graph.getAll<{ id: string; name?: string; currency?: string; account_status?: number }>(
      'me/adaccounts',
      { fields: 'id,name,currency,account_status' },
    ),
    graph.getAll<{
      id: string;
      name?: string;
      access_token?: string;
      instagram_business_account?: { id: string; username?: string };
    }>('me/accounts', {
      fields: 'id,name,access_token,instagram_business_account{id,username}',
    }),
    graph.getAll<{ permission: string; status: string }>('me/permissions'),
  ]);
  const granted = new Set(
    permissions.filter((p) => p.status === 'granted').map((p) => p.permission),
  );
  return {
    adAccounts: accounts.map((a) => ({
      id: a.id,
      name: a.name ?? a.id,
      note: a.currency ?? null,
      currency: a.currency ?? 'INR',
      accountStatus: a.account_status ?? 1,
    })),
    pages: pages
      .filter((p) => p.access_token)
      .map((p) => ({
        id: p.id,
        name: p.name ?? p.id,
        note: p.instagram_business_account?.username
          ? `Instagram @${p.instagram_business_account.username}`
          : null,
        pageToken: p.access_token as string,
        instagramId: p.instagram_business_account?.id ?? null,
        instagramUsername: p.instagram_business_account?.username ?? null,
      })),
    missing: META_SCOPES.filter((scope) => !granted.has(scope)),
  };
}

const SUBSCRIBED_FIELDS = 'leadgen,messages,messaging_postbacks,messaging_referrals,feed';

type Step = () => Promise<string | null>;

/** A failing step becomes a note, except a sign-out, which the caller must see. */
async function attempt(notes: string[], label: string, step: Step): Promise<string | null> {
  try {
    return await step();
  } catch (error) {
    if (error instanceof PlatformError && error.kind === 'auth') throw error;
    const why = error instanceof PlatformError ? error.message : 'Meta did not answer.';
    notes.push(`${label}: ${why}`);
    return null;
  }
}

/**
 * Gets the picked page ready: subscribes it to our webhooks (leads, messages, comments) and finds
 * or makes the Conversions API dataset (the WhatsApp account's when there is one).
 */
export async function metaPrepare(
  app: MetaAppConfig,
  access: {
    readonly userToken: string;
    readonly pageToken: string;
    readonly pageId: string;
    readonly adAccountId: string;
    readonly whatsappBusinessAccountId: string | null;
  },
): Promise<{ readonly datasetId: string | null; readonly notes: readonly string[] }> {
  const notes: string[] = [];
  const pageGraph = metaGraph(app, access.pageToken);
  const userGraph = metaGraph(app, access.userToken);

  await attempt(notes, 'Could not subscribe the page to messages and leads', async () => {
    await pageGraph.post(
      `${access.pageId}/subscribed_apps`,
      { subscribed_fields: SUBSCRIBED_FIELDS },
      { form: true },
    );
    return null;
  });

  const waba = access.whatsappBusinessAccountId;
  const datasetId = await attempt(
    notes,
    'Could not set up the Conversions API dataset',
    async () => {
      if (waba) {
        const found = await userGraph.get<{ data?: { id: string }[] }>(`${waba}/dataset`);
        const existing = found.data?.[0]?.id;
        if (existing) return existing;
        return (await userGraph.post<{ id: string }>(`${waba}/dataset`, {})).id;
      }
      const found = await userGraph.get<{ data?: { id: string }[] }>(
        `${access.adAccountId}/adspixels`,
        { fields: 'id,name' },
      );
      const existing = found.data?.[0]?.id;
      if (existing) return existing;
      return (
        await userGraph.post<{ id: string }>(`${access.adAccountId}/adspixels`, { name: 'OneOhm' })
      ).id;
    },
  );
  return { datasetId, notes };
}
