import { describe, expect, it } from 'vitest';
import { createMetaPlatform } from './meta-platform';
import { fakeGraph, metaAccess, metaApp } from './meta-test-kit';

describe('meta insights, state, statuses and balance', () => {
  it('follows paging and turns spend into paise', async () => {
    const { fetch, calls } = fakeGraph({
      'GET act_123/insights': {
        data: [
          {
            ad_id: 'A1',
            campaign_id: 'C1',
            spend: '12.34',
            impressions: '100',
            clicks: '5',
            date_start: '2026-11-01',
          },
        ],
        paging: { next: 'https://graph.facebook.com/v26.0/act_123/insights?after=X' },
      },
    });
    let page = 0;
    const wrapped = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes('after=X') && page++ === 0) {
        return new Response(
          JSON.stringify({
            data: [
              {
                ad_id: 'A2',
                campaign_id: 'C1',
                spend: '0.5',
                impressions: '9',
                clicks: '1',
                date_start: '2026-11-02',
              },
            ],
          }),
        );
      }
      return fetch(input, init);
    }) as typeof fetch;
    const rows = await createMetaPlatform(metaAccess(), metaApp(wrapped)).spend({
      since: '2026-11-01',
      until: '2026-11-02',
    });
    expect(rows).toEqual([
      {
        externalId: 'A1',
        campaignExternalId: 'C1',
        day: '2026-11-01',
        spendPaise: 1234,
        impressions: 100,
        clicks: 5,
      },
      {
        externalId: 'A2',
        campaignExternalId: 'C1',
        day: '2026-11-02',
        spendPaise: 50,
        impressions: 9,
        clicks: 1,
      },
    ]);
    const first = calls[0];
    expect(first?.query.get('level')).toBe('ad');
    expect(first?.query.get('time_increment')).toBe('1');
    expect(first?.query.get('limit')).toBe('500');
    expect(JSON.parse(first?.query.get('time_range') ?? '{}')).toEqual({
      since: '2026-11-01',
      until: '2026-11-02',
    });
  });

  it('reads a prepaid balance and a problem', async () => {
    const { fetch } = fakeGraph({
      'GET act_123': {
        account_status: 9,
        currency: 'INR',
        is_prepay_account: true,
        funding_source_details: { display_string: 'Available balance (₹2,500.00 INR)' },
      },
    });
    const balance = await createMetaPlatform(metaAccess(), metaApp(fetch)).balance();
    expect(balance).toMatchObject({
      balancePaise: 250000,
      currency: 'INR',
      topUpUrl: 'https://business.facebook.com/billing_hub/accounts/details?asset_id=123',
    });
    expect(balance?.problem).toContain('grace period');
  });

  it('has no balance for postpaid accounts', async () => {
    const { fetch } = fakeGraph({ 'GET act_123': { account_status: 1, is_prepay_account: false } });
    const balance = await createMetaPlatform(metaAccess(), metaApp(fetch)).balance();
    expect(balance).toMatchObject({ balancePaise: null, problem: null });
  });

  it('maps ad statuses', async () => {
    const { fetch, calls } = fakeGraph({
      'GET ': {
        A1: { effective_status: 'PENDING_REVIEW' },
        A2: { effective_status: 'DISAPPROVED', ad_review_feedback: { global: 'Text is too long' } },
        A3: { effective_status: 'PENDING_BILLING_INFO' },
        A4: { effective_status: 'ACTIVE' },
      },
    });
    const out = await createMetaPlatform(metaAccess(), metaApp(fetch)).adStatuses([
      'A1',
      'A2',
      'A3',
      'A4',
    ]);
    expect(calls[0]?.query.get('ids')).toBe('A1,A2,A3,A4');
    expect(out.map((s) => [s.externalId, s.inReview, s.rejected, s.reason])).toEqual([
      ['A1', true, false, null],
      ['A2', false, true, 'Text is too long'],
      ['A3', false, false, 'Add a payment method in Meta'],
      ['A4', false, false, null],
    ]);
  });

  it('switches on children first and pauses without deleting', async () => {
    const ok = { success: true };
    const { fetch, calls } = fakeGraph({ 'POST A1': ok, 'POST S1': ok, 'POST C1': ok });
    const platform = createMetaPlatform(metaAccess(), metaApp(fetch));
    const placement = { externalId: 'C1', externalIds: { campaign: 'C1', adSet: 'S1', ad: 'A1' } };
    await platform.setState(placement, 'active');
    expect(calls.map((c) => [c.method, c.path, c.body.status])).toEqual([
      ['POST', 'A1', 'ACTIVE'],
      ['POST', 'S1', 'ACTIVE'],
      ['POST', 'C1', 'ACTIVE'],
    ]);
    calls.length = 0;
    await platform.setState(placement, 'stopped');
    expect(calls.every((c) => c.method === 'POST' && c.body.status === 'PAUSED')).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it('reads the amount, sign and never card digits from the balance text', async () => {
    const read = async (display: string) => {
      const { fetch } = fakeGraph({
        'GET act_123': {
          account_status: 1,
          currency: 'INR',
          is_prepay_account: true,
          funding_source_details: { display_string: display },
        },
      });
      return (await createMetaPlatform(metaAccess(), metaApp(fetch)).balance())?.balancePaise;
    };
    expect(await read('Available balance (₹2,500.00 INR)')).toBe(250000);
    expect(await read('Available balance (-₹120.50 INR)')).toBe(-12050);
    expect(await read('Visa *4242')).toBeNull();
    expect(await read('Visa *4242, balance (₹99.00 INR)')).toBe(9900);
  });

  it('refuses a non-rupee account: no spend rows, a balance problem', async () => {
    const usd = { ...metaAccess(), currency: 'USD' };
    const { fetch, calls } = fakeGraph({
      'GET act_123': { account_status: 1, currency: 'USD', is_prepay_account: true },
    });
    const platform = createMetaPlatform(usd, metaApp(fetch));
    expect(await platform.spend({ since: '2026-11-01', until: '2026-11-02' })).toEqual([]);
    expect(calls).toHaveLength(0);
    expect(await platform.balance()).toMatchObject({
      balancePaise: null,
      currency: 'USD',
      problem: 'This Meta ad account is not in rupees (INR). Pick an ad account set to INR.',
    });
  });
});
