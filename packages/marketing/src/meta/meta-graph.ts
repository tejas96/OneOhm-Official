import { createHmac } from 'node:crypto';
import type { MetaAppConfig } from '../access';
import { PlatformError } from '../errors';
import type { Fetch } from '../types';
import { graphError } from './meta-errors';

export { graphError } from './meta-errors';

export type QueryValue = string | number | boolean | object | null | undefined;

export interface GraphConfig {
  readonly fetch: Fetch;
  readonly version: string;
  /** Null for the sign-in calls that use the app id and secret instead. */
  readonly token: string | null;
  /** When set, `appsecret_proof` goes with every call. */
  readonly appSecret?: string | null;
}

export interface Graph {
  get<T>(path: string, query?: Record<string, QueryValue>): Promise<T>;
  /** Reads a list and follows `paging.next` until the end. */
  getAll<T>(path: string, query?: Record<string, QueryValue>): Promise<T[]>;
  post<T>(
    path: string,
    body?: Record<string, QueryValue>,
    options?: { form?: boolean; query?: Record<string, QueryValue> },
  ): Promise<T>;
  del<T>(path: string, body?: Record<string, QueryValue>): Promise<T>;
}

const TIMEOUT_MS = 30_000;
const BASE = 'https://graph.facebook.com';

const asText = (value: QueryValue): string =>
  typeof value === 'string'
    ? value
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);

/** The proof Meta checks against our app secret. */
export function appSecretProof(token: string, appSecret: string): string {
  return createHmac('sha256', appSecret).update(token).digest('hex');
}

export function createGraph(config: GraphConfig): Graph {
  const url = (path: string, query: Record<string, QueryValue> = {}): string => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) params.set(key, asText(value));
    }
    if (config.token) {
      params.set('access_token', config.token);
      if (config.appSecret)
        params.set('appsecret_proof', appSecretProof(config.token, config.appSecret));
    }
    return `${BASE}/${config.version}/${path}?${params.toString()}`;
  };

  async function send<T>(target: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await config.fetch(target, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new PlatformError(
        'temporary',
        'Meta did not answer in time. Try again in a minute.',
        'network or timeout',
      );
    }
    const text = await response.text();
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      if (response.ok) body = {};
      else throw graphError(response.status, {});
    }
    if (!response.ok || (body as { error?: unknown } | null)?.error) {
      throw graphError(response.status, body);
    }
    return body as T;
  }

  const withBody = <T>(
    method: 'POST' | 'DELETE',
    path: string,
    body: Record<string, QueryValue>,
    form: boolean,
    query?: Record<string, QueryValue>,
  ): Promise<T> => {
    if (form) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined && value !== null) params.set(key, asText(value));
      }
      return send<T>(url(path, query), {
        method,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
    }
    return send<T>(url(path, query), {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  return {
    get: (path, query) => send(url(path, query), { method: 'GET' }),
    async getAll<T>(path: string, query?: Record<string, QueryValue>) {
      const rows: T[] = [];
      type Page = { data?: T[]; paging?: { next?: string } };
      let page = await send<Page>(url(path, query), { method: 'GET' });
      for (let i = 0; i < 100; i++) {
        rows.push(...(page.data ?? []));
        const next = page.paging?.next;
        if (!next) break;
        page = await send<Page>(next, { method: 'GET' });
      }
      return rows;
    },
    post: (path, body = {}, options) =>
      withBody('POST', path, body, options?.form ?? false, options?.query),
    del: (path, body = {}) => withBody('DELETE', path, body, false),
  };
}

/** A graph client for the Meta app, signing every call with `appsecret_proof`. */
export function metaGraph(app: MetaAppConfig, token: string): Graph {
  return createGraph({
    fetch: app.fetch,
    version: app.graphVersion,
    token,
    appSecret: app.appSecret,
  });
}
