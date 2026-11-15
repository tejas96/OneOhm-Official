import type { GoogleAppConfig } from '../access';
import { type GoogleJson, googleApiError, googleNetworkError } from './google-errors';

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TIMEOUT_MS = 30_000;
const EXPIRY_MARGIN_MS = 60_000;

/** Who the calls are made as: the login, and the manager account it goes through. */
export interface GoogleAuth {
  readonly refreshToken: string;
  readonly loginCustomerId: string | null;
}

export interface GoogleAdsClient {
  /** Runs a GAQL query and returns every row (follows `nextPageToken`). */
  search(customerId: string, gaql: string): Promise<GoogleJson[]>;
  /** POST `customers/<id>/<path>`. */
  mutate(customerId: string, path: string, body: unknown): Promise<GoogleJson>;
  /** POST any path under the API version (not tied to one customer). */
  post(path: string, body: unknown): Promise<GoogleJson>;
  get(path: string): Promise<GoogleJson>;
}

const tokens = new Map<string, { readonly token: string; readonly expiresAt: number }>();

/** Forgets cached access tokens (tests). */
export function clearGoogleTokenCache(): void {
  tokens.clear();
}

/** One call with a time limit; a dead network becomes a `temporary` error. */
async function call(
  app: GoogleAppConfig,
  url: string,
  init: RequestInit,
): Promise<{ readonly ok: boolean; readonly status: number; readonly body: GoogleJson }> {
  try {
    const response = await app.fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    throw googleNetworkError(error);
  }
}

/** Asks Google's token endpoint (code exchange or refresh). Throws a plain `PlatformError`. */
export async function googleTokenRequest(
  app: GoogleAppConfig,
  params: Record<string, string>,
): Promise<GoogleJson> {
  const form = new URLSearchParams({
    client_id: app.clientId,
    client_secret: app.clientSecret,
    ...params,
  });
  const result = await call(app, GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!result.ok) throw googleApiError(result.status, result.body);
  return result.body;
}

/** An access token for the refresh token, kept until a minute before it ends. */
export async function googleAccessToken(
  app: GoogleAppConfig,
  refreshToken: string,
): Promise<string> {
  const key = `${app.clientId}:${refreshToken}`;
  const cached = tokens.get(key);
  if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return cached.token;
  const body = await googleTokenRequest(app, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const token = String(body?.access_token ?? '');
  tokens.set(key, { token, expiresAt: Date.now() + Number(body?.expires_in ?? 3600) * 1000 });
  return token;
}

/** True when a still-fresh access token is kept for this refresh token. */
function hasFreshToken(app: GoogleAppConfig, refreshToken: string): boolean {
  const cached = tokens.get(`${app.clientId}:${refreshToken}`);
  return Boolean(cached && cached.expiresAt - EXPIRY_MARGIN_MS > Date.now());
}

export function createGoogleAds(app: GoogleAppConfig, auth: GoogleAuth): GoogleAdsClient {
  const base = `https://googleads.googleapis.com/${app.apiVersion}/`;

  async function send(path: string, method: 'GET' | 'POST', body?: unknown): Promise<GoogleJson> {
    // A kept token Google no longer accepts: forget it and ask again, once.
    const usedCache = hasFreshToken(app, auth.refreshToken);
    const first = await attempt(path, method, body);
    if (first.status !== 401 || !usedCache) return finish(first);
    tokens.delete(`${app.clientId}:${auth.refreshToken}`);
    return finish(await attempt(path, method, body));
  }

  function finish(result: Awaited<ReturnType<typeof call>>): GoogleJson {
    if (!result.ok) throw googleApiError(result.status, result.body);
    return result.body ?? {};
  }

  async function attempt(path: string, method: 'GET' | 'POST', body?: unknown) {
    const token = await googleAccessToken(app, auth.refreshToken);
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      'developer-token': app.developerToken,
      'content-type': 'application/json',
    };
    const login = auth.loginCustomerId?.replace(/\D/g, '');
    if (login) headers['login-customer-id'] = login;
    return call(app, base + path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  return {
    get: (path) => send(path, 'GET'),
    post: (path, body) => send(path, 'POST', body),
    mutate: (customerId, path, body) => send(`customers/${customerId}/${path}`, 'POST', body),
    async search(customerId, gaql) {
      const rows: GoogleJson[] = [];
      let pageToken: string | undefined;
      do {
        const page = await send(`customers/${customerId}/googleAds:search`, 'POST', {
          query: gaql,
          ...(pageToken ? { pageToken } : {}),
        });
        rows.push(...(page.results ?? []));
        pageToken = page.nextPageToken || undefined;
      } while (pageToken);
      return rows;
    },
  };
}
