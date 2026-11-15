import { describe, expect, it } from 'vitest';
import { hashPhoneFor } from '../hashing';
import type { ConversionInput } from '../types';
import { createGooglePlatform } from './google-platform';
import { fakeGoogle, testAccess, testApp } from './google-test-kit';

const ACTION = 'customers/1234567890/conversionActions/11';

function event(changes: Partial<ConversionInput> = {}): ConversionInput {
  return {
    id: 'ev-1',
    event: 'quoted',
    eventAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
    valuePaise: 12_345_00,
    phoneE164: '+919876543210',
    email: ' Ravi@Example.com ',
    gclid: 'gclid-1',
    fbclid: null,
    ctwaClid: null,
    platformLeadId: null,
    leadCreatedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000),
    ...changes,
  };
}

describe('google reports', () => {
  it('turns spend micros into paise', async () => {
    const google = fakeGoogle([
      [
        'googleAds:search',
        () => ({
          results: [
            {
              campaign: { id: '777' },
              segments: { date: '2026-11-14' },
              metrics: { costMicros: '123456789', impressions: '1000', clicks: '25' },
            },
          ],
        }),
      ],
    ]);
    const platform = createGooglePlatform(testAccess(), testApp(google.fetch));
    const rows = await platform.spend({ since: '2026-11-14', until: '2026-11-15' });
    expect(rows).toEqual([
      {
        externalId: '777',
        campaignExternalId: '777',
        day: '2026-11-14',
        spendPaise: 12346,
        impressions: 1000,
        clicks: 25,
      },
    ]);
    const query = google.calls.find((c) => c.body?.query)?.body.query;
    expect(query).toContain("segments.date BETWEEN '2026-11-14' AND '2026-11-15'");
  });

  it('reads review state in plain words', async () => {
    const google = fakeGoogle([
      [
        'googleAds:search',
        () => ({
          results: [
            {
              campaign: {
                id: '1',
                status: 'ENABLED',
                primaryStatus: 'PENDING',
                primaryStatusReasons: ['MOST_ASSET_GROUPS_UNDER_REVIEW'],
              },
            },
            {
              campaign: {
                id: '2',
                status: 'ENABLED',
                primaryStatus: 'NOT_ELIGIBLE',
                primaryStatusReasons: ['HAS_ASSET_GROUPS_DISAPPROVED'],
              },
            },
            {
              campaign: {
                id: '3',
                status: 'ENABLED',
                primaryStatus: 'ELIGIBLE',
                primaryStatusReasons: [],
              },
            },
          ],
        }),
      ],
    ]);
    const platform = createGooglePlatform(testAccess(), testApp(google.fetch));
    const result = await platform.adStatuses(['1', '2', '3', 'x; DROP']);
    expect(result.map((r) => [r.externalId, r.inReview, r.rejected])).toEqual([
      ['1', true, false],
      ['2', false, true],
      ['3', false, false],
    ]);
    expect(result[1]?.reason).toContain('did not approve');
    expect(google.calls.find((c) => c.body?.query)?.body.query).toContain(
      'campaign.id IN (1, 2, 3)',
    );
  });

  it('reads balance and account problems', async () => {
    const google = fakeGoogle([
      [
        'googleAds:search',
        (call) =>
          String(call.body.query).includes('FROM customer')
            ? { results: [{ customer: { status: 'SUSPENDED' } }] }
            : {
                results: [
                  {
                    accountBudget: {
                      approvedSpendingLimitMicros: '1000000000',
                      amountServedMicros: '250000000',
                    },
                  },
                ],
              },
      ],
    ]);
    const platform = createGooglePlatform(testAccess(), testApp(google.fetch));
    const balance = await platform.balance();
    expect(balance).toMatchObject({
      balancePaise: 75_000,
      currency: 'INR',
      topUpUrl: 'https://ads.google.com/aw/billing/summary',
    });
    expect(balance?.problem).toContain('suspended');
  });

  it('has no balance for a postpaid account', async () => {
    const google = fakeGoogle([
      ['googleAds:search', () => ({ results: [{ customer: { status: 'ENABLED' } }] })],
    ]);
    const platform = createGooglePlatform(testAccess(), testApp(google.fetch));
    const balance = await platform.balance();
    expect(balance?.balancePaise).toBeNull();
    expect(balance?.problem).toBeNull();
  });
});

describe('google conversions', () => {
  const access = () =>
    testAccess({
      conversionActions: { quoted: ACTION, won: ACTION },
      enhancedConversionsForLeads: true,
    });

  it('sends with India time, rupees, hashed phone and email', async () => {
    const google = fakeGoogle([['uploadClickConversions', () => ({ results: [{}] })]]);
    const platform = createGooglePlatform(access(), testApp(google.fetch));
    const at = new Date('2026-11-13T20:00:05Z');
    const out = await platform.sendConversions([event({ eventAt: at, valuePaise: 12_345_00 })]);
    expect(out).toEqual([{ id: 'ev-1', status: 'sent' }]);
    const call = google.calls.find((c) => c.url.includes('uploadClickConversions'));
    expect(call?.url).toBe(
      'https://googleads.googleapis.com/v26/customers/1234567890:uploadClickConversions',
    );
    expect(call?.body.partialFailure).toBe(true);
    const sent = call?.body.conversions[0];
    expect(sent).toMatchObject({
      gclid: 'gclid-1',
      conversionAction: ACTION,
      conversionDateTime: '2026-11-14 01:30:05+05:30',
      conversionValue: 12345,
      currencyCode: 'INR',
      orderId: 'ev-1',
    });
    expect(sent.userIdentifiers[0].hashedPhoneNumber).toBe(hashPhoneFor('google', '+919876543210'));
    expect(sent.userIdentifiers[1].hashedEmail).toMatch(/^[0-9a-f]{64}$/);
  });

  it('skips with plain words and sends nothing when none can go', async () => {
    const google = fakeGoogle([]);
    const platform = createGooglePlatform(access(), testApp(google.fetch));
    const out = await platform.sendConversions([
      event({ id: 'a', gclid: null }),
      event({ id: 'b', event: 'survey' }),
      event({ id: 'c', leadCreatedAt: new Date(Date.now() - 100 * 24 * 3600 * 1000) }),
    ]);
    expect(out.map((o) => [o.id, o.status])).toEqual([
      ['a', 'skipped'],
      ['b', 'skipped'],
      ['c', 'skipped'],
    ]);
    expect(out[0]?.error).toBe('No Google click on this lead');
    expect(out[1]?.error).toBe('Google conversion steps are not set up yet; connect Google again');
    expect(google.calls).toHaveLength(0);
  });

  it('leaves the value out when it is not known', async () => {
    const google = fakeGoogle([['uploadClickConversions', () => ({})]]);
    const platform = createGooglePlatform(access(), testApp(google.fetch));
    await platform.sendConversions([event({ valuePaise: null, email: null })]);
    const sent = google.calls.find((c) => c.body?.conversions)?.body.conversions[0];
    expect(sent.conversionValue).toBeUndefined();
    expect(sent.userIdentifiers).toHaveLength(1);
  });

  it('maps a partial failure back to the right event', async () => {
    const google = fakeGoogle([
      [
        'uploadClickConversions',
        () => ({
          partialFailureError: {
            code: 3,
            message: 'Partial failure',
            details: [
              {
                errors: [
                  {
                    errorCode: { conversionUploadError: 'EXPIRED_EVENT' },
                    message: 'The click is too old.',
                    location: { fieldPathElements: [{ fieldName: 'conversions', index: 1 }] },
                  },
                ],
              },
            ],
          },
        }),
      ],
    ]);
    const platform = createGooglePlatform(access(), testApp(google.fetch));
    const out = await platform.sendConversions([
      event({ id: 'a' }),
      event({ id: 'skip', gclid: null }),
      event({ id: 'b', event: 'won' }),
    ]);
    expect(out).toEqual([
      { id: 'a', status: 'sent' },
      { id: 'skip', status: 'skipped', error: 'No Google click on this lead' },
      { id: 'b', status: 'failed', error: 'The click is too old.' },
    ]);
  });
});
