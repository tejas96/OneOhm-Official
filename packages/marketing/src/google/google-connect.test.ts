import { beforeEach, describe, expect, it } from 'vitest';
import { clearGoogleTokenCache } from './google-ads-http';
import {
  googleDiscover,
  googleExchangeCode,
  googleLoginUrl,
  googlePrepare,
} from './google-connect';
import { fail, fakeGoogle, testApp } from './google-test-kit';

beforeEach(() => clearGoogleTokenCache());

describe('googleLoginUrl', () => {
  it('asks for the Google Ads scope, offline, with consent', () => {
    const url = new URL(
      googleLoginUrl(testApp(fetch), { redirectUri: 'https://x.test/cb', state: 's1' }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'client-id',
      redirect_uri: 'https://x.test/cb',
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/adwords',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state: 's1',
    });
  });
});

describe('googleExchangeCode', () => {
  it('returns the refresh token', async () => {
    const google = fakeGoogle([[/oauth2/, () => ({ access_token: 'a', refresh_token: 'rt-1' })]]);
    const result = await googleExchangeCode(testApp(google.fetch), 'code-1', 'https://x.test/cb');
    expect(result).toEqual({ refreshToken: 'rt-1' });
    const body = String(google.calls[0]?.body);
    expect(body).toContain('grant_type=authorization_code');
    expect(body).toContain('code=code-1');
    expect(body).toContain('client_secret=client-secret');
  });

  it('refuses an answer with no refresh token', async () => {
    const google = fakeGoogle([[/oauth2/, () => ({ access_token: 'a' })]]);
    await expect(
      googleExchangeCode(testApp(google.fetch), 'c', 'https://x.test/cb'),
    ).rejects.toMatchObject({ kind: 'auth' });
  });
});

const customerRow = (id: string, manager: boolean, test = false) => ({
  results: [
    {
      customer: {
        id,
        descriptiveName: `Name ${id}`,
        currencyCode: 'INR',
        manager,
        testAccount: test,
      },
    },
  ],
});

describe('googleDiscover', () => {
  it('offers a direct account and the clients of a manager', async () => {
    const google = fakeGoogle([
      ['listAccessibleCustomers', () => ({ resourceNames: ['customers/111', 'customers/222'] })],
      ['customers/111/googleAds:search', () => customerRow('111', false, true)],
      [
        'customers/222/googleAds:search',
        (call) =>
          String(call.body.query).includes('customer_client')
            ? {
                results: [
                  {
                    customerClient: {
                      id: '333',
                      descriptiveName: 'Client',
                      currencyCode: 'INR',
                      manager: false,
                    },
                  },
                  { customerClient: { id: '444', descriptiveName: 'Sub manager', manager: true } },
                ],
              }
            : customerRow('222', true),
      ],
    ]);
    const result = await googleDiscover(testApp(google.fetch), 'r-d1');
    expect(result.inReview).toBe(false);
    expect(result.customers).toEqual([
      {
        id: '111',
        name: 'Name 111',
        note: 'INR · test account',
        currency: 'INR',
        loginCustomerId: null,
      },
      { id: '333', name: 'Client', note: 'INR', currency: 'INR', loginCustomerId: '222' },
    ]);
    const clientCall = google.calls.find((call) =>
      String(call.body?.query).includes('customer_client'),
    );
    expect(clientCall?.headers['login-customer-id']).toBe('222');
  });

  it('is in review while the developer token is not approved', async () => {
    const google = fakeGoogle([
      [
        'listAccessibleCustomers',
        () =>
          fail(403, {
            error: {
              status: 'PERMISSION_DENIED',
              details: [
                { errors: [{ errorCode: { authorizationError: 'DEVELOPER_TOKEN_NOT_APPROVED' } }] },
              ],
            },
          }),
      ],
    ]);
    expect(await googleDiscover(testApp(google.fetch), 'r-d2')).toEqual({
      customers: [],
      inReview: true,
    });
  });

  it('returns what is known when only some accounts are blocked by the token', async () => {
    const blocked = fail(403, {
      error: {
        details: [
          { errors: [{ errorCode: { authorizationError: 'DEVELOPER_TOKEN_NOT_APPROVED' } }] },
        ],
      },
    });
    const google = fakeGoogle([
      ['listAccessibleCustomers', () => ({ resourceNames: ['customers/1', 'customers/2'] })],
      ['customers/1/', () => customerRow('1', false)],
      ['customers/2/', () => blocked],
    ]);
    const result = await googleDiscover(testApp(google.fetch), 'r-d3');
    expect(result.inReview).toBe(true);
    expect(result.customers.map((c) => c.id)).toEqual(['1']);
  });
});

describe('googlePrepare', () => {
  it('finds existing actions and creates the missing ones', async () => {
    const google = fakeGoogle([
      [
        'googleAds:search',
        (call) =>
          String(call.body.query).includes("'OneOhm · Quoted'")
            ? {
                results: [
                  { conversionAction: { resourceName: 'customers/9/conversionActions/55' } },
                ],
              }
            : {},
      ],
      [
        'conversionActions:mutate',
        (call) => ({
          results: [
            {
              resourceName: `customers/9/conversionActions/${call.body.operations[0].create.category}`,
            },
          ],
        }),
      ],
    ]);
    const result = await googlePrepare(testApp(google.fetch), {
      refreshToken: 'r-p1',
      customerId: '9',
      loginCustomerId: '77',
    });
    expect(result.conversionActions).toEqual({
      survey: 'customers/9/conversionActions/QUALIFIED_LEAD',
      quoted: 'customers/9/conversionActions/55',
      advance_paid: 'customers/9/conversionActions/CONVERTED_LEAD',
      won: 'customers/9/conversionActions/PURCHASE',
    });
    const created = google.calls.filter((call) => call.url.includes('conversionActions:mutate'));
    expect(created).toHaveLength(3);
    expect(created[0]?.body.operations[0].create).toEqual({
      name: 'OneOhm · Survey booked',
      type: 'UPLOAD_CLICKS',
      category: 'QUALIFIED_LEAD',
      status: 'ENABLED',
      countingType: 'ONE_PER_CLICK',
      valueSettings: { defaultValue: 0, defaultCurrencyCode: 'INR', alwaysUseDefaultValue: false },
    });
    expect(
      google.calls.find((call) => call.url.includes('googleAds:search'))?.headers[
        'login-customer-id'
      ],
    ).toBe('77');
  });
});
