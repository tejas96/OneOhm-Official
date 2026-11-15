import { beforeEach, describe, expect, it } from 'vitest';
import { hashEmail, hashPhoneFor } from '../hashing';
import type { ConversionInput } from '../types';
import { clearGoogleTokenCache, createGoogleAds } from './google-ads-http';
import { googleEmailForm } from './google-email';
import { createGooglePlatform } from './google-platform';
import { fail, fakeGoogle, testAccess, testApp } from './google-test-kit';

beforeEach(() => clearGoogleTokenCache());

const ACTION = 'customers/1234567890/conversionActions/11';

function event(changes: Partial<ConversionInput> = {}): ConversionInput {
  return {
    id: 'ev-1',
    event: 'quoted',
    eventAt: new Date(),
    valuePaise: null,
    phoneE164: '+919876543210',
    email: 'Ravi.Kumar+solar@Gmail.com',
    gclid: 'g1',
    fbclid: null,
    ctwaClid: null,
    platformLeadId: null,
    leadCreatedAt: new Date(Date.now() - 24 * 3600 * 1000),
    ...changes,
  };
}

const partial = (...errors: [string, string, number][]) => ({
  partialFailureError: {
    message: 'Partial failure',
    details: [
      {
        errors: errors.map(([group, code, index]) => ({
          errorCode: { [group]: code },
          message: `words ${code}`,
          location: { fieldPathElements: [{ fieldName: 'conversions', index }] },
        })),
      },
    ],
  },
});

describe('google sign-in errors', () => {
  const client = (google: ReturnType<typeof fakeGoogle>, token = 'r-x') =>
    createGoogleAds(testApp(google.fetch), { refreshToken: token, loginCustomerId: null });

  it('says the keys are wrong on invalid_client, even with a 401', async () => {
    const google = fakeGoogle([[/oauth2/, () => fail(401, { error: 'invalid_client' })]]);
    await expect(client(google, 'r-ic').search('1', 'x')).rejects.toMatchObject({
      kind: 'permission',
      message:
        "OneOhm's Google sign-in keys are wrong. Check GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET.",
    });
  });

  it('forgets a kept token on a 401 and tries once more', async () => {
    let tokens = 0;
    let searches = 0;
    const google = fakeGoogle([
      [/oauth2/, () => ({ access_token: `at-${++tokens}`, expires_in: 3600 })],
      [
        'googleAds:search',
        (call) =>
          call.headers.authorization === 'Bearer at-1' && ++searches > 1
            ? fail(401, { error: { status: 'UNAUTHENTICATED' } })
            : { results: [] },
      ],
    ]);
    const ads = client(google, 'r-401');
    await ads.search('1', 'a');
    await ads.search('1', 'b');
    expect(tokens).toBe(2);
    expect(google.calls.filter((c) => c.url.includes('googleAds:search'))).toHaveLength(3);
  });

  it('signs out when a fresh token is refused with 401', async () => {
    const google = fakeGoogle([['googleAds:search', () => fail(401, {})]]);
    await expect(client(google, 'r-fresh').search('1', 'x')).rejects.toMatchObject({
      kind: 'auth',
    });
    expect(google.calls.filter((c) => c.url.includes('googleAds:search'))).toHaveLength(1);
  });

  it('treats CONCURRENT_MODIFICATION as temporary', async () => {
    const body = {
      error: {
        details: [{ errors: [{ errorCode: { databaseError: 'CONCURRENT_MODIFICATION' } }] }],
      },
    };
    const google = fakeGoogle([['googleAds:search', () => fail(409, body)]]);
    const error = await client(google, 'r-cm')
      .search('1', 'x')
      .catch((e) => e);
    expect(error.retryable).toBe(true);
  });

  it('does not call a CANCELLED request an inactive account', async () => {
    const google = fakeGoogle([
      ['googleAds:search', () => fail(499, { error: { status: 'CANCELLED', message: 'gone' } })],
    ]);
    const error = await client(google, 'r-cx')
      .search('1', 'x')
      .catch((e) => e);
    expect(error.kind).not.toBe('account');
  });
});

describe('google conversions details', () => {
  const run = async (details: object, events: ConversionInput[], reply: unknown = {}) => {
    const google = fakeGoogle([['uploadClickConversions', () => reply]]);
    const platform = createGooglePlatform(
      testAccess({ conversionActions: { quoted: ACTION }, ...details }),
      testApp(google.fetch),
    );
    const out = await platform.sendConversions(events);
    return { out, sent: google.calls.find((c) => c.body?.conversions)?.body.conversions };
  };

  it('sends the click alone unless enhanced conversions are on', async () => {
    const { sent } = await run({}, [event()]);
    expect(sent[0].userIdentifiers).toBeUndefined();
    expect(sent[0].gclid).toBe('g1');
  });

  it('adds hashed phone and Google-normalised email when enhanced conversions are on', async () => {
    const { sent } = await run({ enhancedConversionsForLeads: true }, [event()]);
    expect(sent[0].userIdentifiers).toEqual([
      { hashedPhoneNumber: hashPhoneFor('google', '+919876543210') },
      { hashedEmail: hashEmail('ravikumar@gmail.com') },
    ]);
  });

  it('counts 90 days from the click, not from the sale step', async () => {
    const old = new Date(Date.now() - 100 * 24 * 3600 * 1000);
    const { out } = await run({}, [event({ id: 'old', leadCreatedAt: old, eventAt: new Date() })]);
    expect(out[0]?.status).toBe('skipped');
    const recent = await run({}, [event({ id: 'new', leadCreatedAt: new Date(), eventAt: old })]);
    expect(recent.out[0]?.status).toBe('sent');
  });

  it('counts a repeat as sent, waits on "too recent", fails the rest', async () => {
    const { out } = await run(
      {},
      [event({ id: 'a' }), event({ id: 'b' }), event({ id: 'c' }), event({ id: 'd' })],
      partial(
        ['conversionUploadError', 'DUPLICATE_ORDER_ID', 0],
        ['conversionUploadError', 'TOO_RECENT_CONVERSION_ACTION', 1],
        ['conversionUploadError', 'TOO_RECENT_EVENT', 2],
        ['conversionUploadError', 'EXPIRED_EVENT', 3],
      ),
    );
    expect(out.map((o) => [o.id, o.status])).toEqual([
      ['a', 'sent'],
      ['b', 'retry'],
      ['c', 'retry'],
      ['d', 'failed'],
    ]);
    expect(out[1]?.error).toContain('TOO_RECENT');
  });

  it('writes gmail addresses the way Google hashes them', () => {
    expect(googleEmailForm(' A.B+x@googlemail.com ')).toBe('ab@googlemail.com');
    expect(googleEmailForm('A.B+x@example.com')).toBe('a.b+x@example.com');
    expect(googleEmailForm('')).toBeNull();
  });
});
