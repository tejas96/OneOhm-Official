import { beforeEach, describe, expect, it } from 'vitest';
import { PlatformError } from '../errors';
import { clearGoogleTokenCache, createGoogleAds } from './google-ads-http';
import { type Call, fail, fakeGoogle, ok, type Route, testApp } from './google-test-kit';

const apiCalls = (calls: Call[]) =>
  calls.filter((call) => call.url.includes('googleads.googleapis.com'));

beforeEach(() => clearGoogleTokenCache());

describe('access token', () => {
  it('refreshes once and reuses the token', async () => {
    const google = fakeGoogle([['googleAds:search', () => ({ results: [] })]]);
    const client = createGoogleAds(testApp(google.fetch), {
      refreshToken: 'r-cache',
      loginCustomerId: null,
    });
    await client.search('111', 'SELECT 1');
    await client.search('111', 'SELECT 2');
    const tokenCalls = google.calls.filter((call) => call.url.includes('oauth2.googleapis.com'));
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0]?.body).toContain('grant_type=refresh_token');
    expect(tokenCalls[0]?.body).toContain('refresh_token=r-cache');
  });

  it('asks again once the token is within a minute of ending', async () => {
    const google = fakeGoogle([
      [/oauth2/, () => ({ access_token: 'short', expires_in: 30 })],
      ['googleAds:search', () => ({ results: [] })],
    ]);
    const client = createGoogleAds(testApp(google.fetch), {
      refreshToken: 'r-short',
      loginCustomerId: null,
    });
    await client.search('111', 'SELECT 1');
    await client.search('111', 'SELECT 2');
    expect(google.calls.filter((call) => call.url.includes('oauth2'))).toHaveLength(2);
  });

  it('says Google signed us out on invalid_grant', async () => {
    const google = fakeGoogle([[/oauth2/, () => fail(400, { error: 'invalid_grant' })]]);
    const client = createGoogleAds(testApp(google.fetch), {
      refreshToken: 'r-bad',
      loginCustomerId: null,
    });
    await expect(client.search('1', 'x')).rejects.toMatchObject({
      kind: 'auth',
      message: 'Google signed us out. Connect Google again.',
    });
  });
});

describe('calls', () => {
  it('sends the bearer, developer token and login customer id', async () => {
    const google = fakeGoogle([['googleAds:search', () => ({ results: [] })]]);
    const client = createGoogleAds(testApp(google.fetch), {
      refreshToken: 'r-h',
      loginCustomerId: '999-888-7777',
    });
    await client.search('123', 'SELECT 1');
    const call = apiCalls(google.calls)[0];
    expect(call?.url).toBe('https://googleads.googleapis.com/v26/customers/123/googleAds:search');
    expect(call?.headers.authorization).toBe('Bearer at-1');
    expect(call?.headers['developer-token']).toBe('dev-token');
    expect(call?.headers['login-customer-id']).toBe('9998887777');
    expect(call?.body).toEqual({ query: 'SELECT 1' });
  });

  it('leaves out login-customer-id when there is none', async () => {
    const google = fakeGoogle([['googleAds:search', () => ({ results: [] })]]);
    const client = createGoogleAds(testApp(google.fetch), {
      refreshToken: 'r-n',
      loginCustomerId: null,
    });
    await client.search('123', 'SELECT 1');
    expect(apiCalls(google.calls)[0]?.headers['login-customer-id']).toBeUndefined();
  });

  it('follows nextPageToken', async () => {
    const pages = [{ results: [{ a: 1 }], nextPageToken: 'p2' }, { results: [{ a: 2 }] }];
    const google = fakeGoogle([['googleAds:search', () => pages.shift()]]);
    const client = createGoogleAds(testApp(google.fetch), {
      refreshToken: 'r-p',
      loginCustomerId: null,
    });
    expect(await client.search('1', 'q')).toEqual([{ a: 1 }, { a: 2 }]);
    expect(apiCalls(google.calls)[1]?.body).toEqual({ query: 'q', pageToken: 'p2' });
  });

  it('posts a mutate under the customer', async () => {
    const google = fakeGoogle([['conversionActions:mutate', () => ok({ results: [] })]]);
    const client = createGoogleAds(testApp(google.fetch), {
      refreshToken: 'r-m',
      loginCustomerId: null,
    });
    await client.mutate('55', 'conversionActions:mutate', { operations: [] });
    expect(apiCalls(google.calls)[0]?.url).toBe(
      'https://googleads.googleapis.com/v26/customers/55/conversionActions:mutate',
    );
  });
});

describe('error mapping', () => {
  const run = async (reply: ReturnType<typeof fail> | Error): Promise<PlatformError> => {
    const routes: Route[] = [
      [
        'googleAds:search',
        () => {
          if (reply instanceof Error) throw reply;
          return reply;
        },
      ],
    ];
    const google = fakeGoogle(routes);
    const client = createGoogleAds(testApp(google.fetch), {
      refreshToken: `r-e-${Math.random()}`,
      loginCustomerId: null,
    });
    return client.search('1', 'q').then(
      () => {
        throw new Error('should fail');
      },
      (error) => error as PlatformError,
    );
  };
  const google = (
    group: string,
    code: string,
    message = 'Google words',
    status = 'PERMISSION_DENIED',
  ) => ({
    error: {
      code: 403,
      status,
      message,
      details: [{ errors: [{ errorCode: { [group]: code }, message }] }],
    },
  });

  it.each([
    ['authorizationError', 'DEVELOPER_TOKEN_NOT_APPROVED', 'permission'],
    ['authorizationError', 'DEVELOPER_TOKEN_PROHIBITED', 'permission'],
    ['authorizationError', 'USER_PERMISSION_DENIED', 'permission'],
    ['authorizationError', 'CUSTOMER_NOT_ENABLED', 'account'],
    ['authenticationError', 'OAUTH_TOKEN_REVOKED', 'auth'],
    ['quotaError', 'RESOURCE_EXHAUSTED', 'rate'],
    ['internalError', 'INTERNAL_ERROR', 'temporary'],
    ['featureError', 'CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE', 'not_available'],
    ['offlineUserDataJobError', 'CUSTOMER_MATCH_X', 'not_available'],
    ['requestError', 'INVALID_ARGUMENT', 'invalid'],
  ])('%s %s becomes %s', async (group, code, kind) => {
    const error = await run(fail(400, google(group, code, 'Some words', 'INVALID_ARGUMENT')));
    expect(error).toBeInstanceOf(PlatformError);
    expect(error.kind).toBe(kind);
    expect(error.detail).toContain(code);
  });

  it('explains the developer token in plain words', async () => {
    const error = await run(
      fail(403, google('authorizationError', 'DEVELOPER_TOKEN_NOT_APPROVED')),
    );
    expect(error.message).toBe("Google is still approving OneOhm's developer token.");
  });

  it('keeps Google words for an invalid request, and no tokens', async () => {
    const error = await run(
      fail(400, google('requestError', 'BAD', 'Headline too long', 'INVALID_ARGUMENT')),
    );
    expect(error.message).toBe('Headline too long');
    expect(`${error.message} ${error.detail}`).not.toContain('at-1');
  });

  it('treats a 503 and a dead network as temporary', async () => {
    expect((await run(fail(503, 'down'))).kind).toBe('temporary');
    const network = await run(new Error('socket hang up'));
    expect(network.kind).toBe('temporary');
    expect(network.retryable).toBe(true);
  });
});
