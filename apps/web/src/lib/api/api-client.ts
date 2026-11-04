'use client';

import { type ApiFetcher, initClient, tsRestFetchApi } from '@ts-rest/core';
import { networkError, toApiError } from './api-error';
import { apiContract, CSRF_COOKIE, CSRF_HEADER } from './contract';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  for (const part of document.cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/** Adds the double-submit CSRF header to unsafe requests; cookies travel automatically. */
const fetcher: ApiFetcher = async (args) => {
  const headers: Record<string, string> = { ...args.headers };
  if (UNSAFE_METHODS.has(args.method.toUpperCase())) {
    const token = readCookie(CSRF_COOKIE);
    if (token) headers[CSRF_HEADER] = token;
  }
  try {
    return await tsRestFetchApi({
      ...args,
      headers,
      fetchOptions: { ...args.fetchOptions, credentials: 'same-origin', cache: 'no-store' },
    });
  } catch {
    throw networkError();
  }
};

/** Typed client for every route in the contract. Use with `expectStatus`. */
export const api = initClient(apiContract, {
  baseUrl: '/api',
  baseHeaders: {},
  api: fetcher,
  throwOnUnknownStatus: false,
  validateResponse: false,
});

interface AnyResponse {
  readonly status: number;
  readonly body: unknown;
}

/** Resolves to the body of the expected status; anything else throws an ApiError. */
export async function expectStatus<
  TResponse extends AnyResponse,
  TStatus extends TResponse['status'],
>(
  request: Promise<TResponse>,
  status: TStatus,
): Promise<Extract<TResponse, { status: TStatus }>['body']> {
  const response = await request;
  if (response.status === status)
    return response.body as Extract<TResponse, { status: TStatus }>['body'];
  if (
    response.status === 401 &&
    typeof window !== 'undefined' &&
    !window.location.pathname.startsWith('/sign-in')
  ) {
    window.location.assign(
      `/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
    );
  }
  throw toApiError(response.status, response.body);
}
