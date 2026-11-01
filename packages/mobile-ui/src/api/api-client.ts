import { apiContractOptions, apiRouterDefinition } from '@oneohm/api-contracts';
import { type ApiFetcherArgs, initClient, initContract } from '@ts-rest/core';
import { apiErrorFrom, NetworkError } from './api-error';

/** The same router the API serves. */
export const apiContract = initContract().router(apiRouterDefinition, apiContractOptions);

const REQUEST_TIMEOUT_MS = 20_000;

export interface MobileApiOptions {
  /** The API origin, e.g. https://app.oneohm.in/api or http://192.168.1.20:4200. */
  readonly baseUrl: string;
  /** The current bearer token (kept in memory; persisted by the token store). */
  readonly getToken: () => string | null;
  /** Called when a request that carried a token is answered 401. */
  readonly onUnauthorized: () => void;
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('json')) return undefined;
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * A typed client for every route in the contract, with bearer auth, a timeout and
 * session expiry on 401. Both mobile apps build theirs with this.
 */
export function createMobileApi({ baseUrl, getToken, onUnauthorized }: MobileApiOptions) {
  const fetcher = async (args: ApiFetcherArgs) => {
    const token = getToken();
    const headers: Record<string, string> = { ...args.headers, accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(args.path, {
        method: args.method,
        headers,
        body: args.body ?? null,
        signal: controller.signal,
      });
    } catch {
      throw new NetworkError();
    } finally {
      clearTimeout(timeout);
    }
    const body = await readBody(response);
    if (response.status === 401 && token) onUnauthorized();
    return { status: response.status, body, headers: response.headers };
  };

  const api = initClient(apiContract, {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    baseHeaders: {},
    api: fetcher,
    validateResponse: false,
    throwOnUnknownStatus: false,
  });
  return api;
}

export type MobileApi = ReturnType<typeof createMobileApi>;

type SuccessResponse<T> = Extract<T, { status: 200 | 201 | 202 | 204 }>;

/** Resolves to the success body or throws an `ApiError` with the server's sentence. */
export async function unwrap<T extends { status: number; body: unknown }>(
  request: Promise<T>,
): Promise<SuccessResponse<T>['body']> {
  const response = await request;
  if (response.status >= 200 && response.status < 300) {
    return response.body as SuccessResponse<T>['body'];
  }
  throw apiErrorFrom(response.status, response.body);
}
