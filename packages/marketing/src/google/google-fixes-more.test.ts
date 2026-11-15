import { describe, expect, it } from 'vitest';
import { googlePrepare } from './google-connect';
import { readGoogleLeadWebhook } from './google-leads';
import { createGooglePlatform } from './google-platform';
import { fakeGoogle, testAccess, testApp } from './google-test-kit';

describe('google balance', () => {
  it('counts only approved budgets that are running now, with the adjusted limit', async () => {
    const day = 24 * 3600 * 1000;
    const text = (ms: number) =>
      new Date(Date.now() + ms + 5.5 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const google = fakeGoogle([
      [
        'googleAds:search',
        (call) =>
          String(call.body.query).includes('FROM customer')
            ? { results: [{ customer: { status: 'ENABLED' } }] }
            : {
                results: [
                  {
                    accountBudget: {
                      approvedStartDateTime: text(-5 * day),
                      approvedEndDateTime: text(5 * day),
                      approvedSpendingLimitMicros: '1000000000',
                      adjustedSpendingLimitMicros: '2000000000',
                      amountServedMicros: '500000000',
                    },
                  },
                  {
                    accountBudget: {
                      approvedStartDateTime: text(-9 * day),
                      approvedEndDateTime: text(-1 * day),
                      approvedSpendingLimitMicros: '9000000000',
                      amountServedMicros: '0',
                    },
                  },
                  {
                    accountBudget: {
                      approvedStartDateTime: text(3 * day),
                      approvedSpendingLimitMicros: '9000000000',
                      amountServedMicros: '0',
                    },
                  },
                  {
                    accountBudget: {
                      approvedStartDateTime: text(-2 * day),
                      approvedEndTimeType: 'FOREVER',
                      approvedSpendingLimitMicros: '300000000',
                      amountServedMicros: '100000000',
                    },
                  },
                ],
              },
      ],
    ]);
    const platform = createGooglePlatform(testAccess(), testApp(google.fetch));
    expect((await platform.balance())?.balancePaise).toBe(170_000);
  });
});

describe('google lead form', () => {
  const base = { lead_id: 'L', google_key: 'k' };
  const cols = (...pairs: [string, string][]) =>
    pairs.map(([column_id, string_value]) => ({ column_id, string_value }));

  it('reads verified and work phones, split names and city variants', () => {
    const read = readGoogleLeadWebhook({
      ...base,
      user_column_data: cols(
        ['FIRST_NAME', 'Ravi'],
        ['LAST_NAME', 'Kumar'],
        ['PHONE_NUMBER_VERIFIED', '98765 43210'],
        ['WORK_EMAIL', 'r@work.test'],
        ['CITY_NAME', 'Pune'],
      ),
    });
    expect(read?.lead).toMatchObject({
      name: 'Ravi Kumar',
      phone: '+919876543210',
      email: 'r@work.test',
      city: 'Pune',
    });
    const work = readGoogleLeadWebhook({
      ...base,
      user_column_data: cols(['WORK_PHONE', '9123456789']),
    });
    expect(work?.lead.phone).toBe('+919123456789');
  });
});

describe('googlePrepare enhanced conversions', () => {
  const prepare = async (setting: unknown) => {
    const google = fakeGoogle([
      [
        'googleAds:search',
        (call) =>
          String(call.body.query).includes('conversion_tracking_setting')
            ? { results: [{ customer: { conversionTrackingSetting: setting } }] }
            : {
                results: [
                  { conversionAction: { resourceName: 'customers/9/conversionActions/1' } },
                ],
              },
      ],
    ]);
    const result = await googlePrepare(testApp(google.fetch), {
      refreshToken: `r-${Math.random()}`,
      customerId: '9',
      loginCustomerId: null,
    });
    return {
      result,
      query: google.calls.find((c) => String(c.body?.query).includes('conversion_tracking_setting'))
        ?.body.query,
    };
  };

  it('reports true only when the terms are accepted and the setting is on', async () => {
    const on = await prepare({
      acceptedCustomerDataTerms: true,
      enhancedConversionsForLeadsEnabled: true,
    });
    expect(on.result.enhancedConversionsForLeads).toBe(true);
    expect(on.query).toContain('customer.conversion_tracking_setting.accepted_customer_data_terms');
    expect(on.query).toContain(
      'customer.conversion_tracking_setting.enhanced_conversions_for_leads_enabled',
    );
    expect(
      (await prepare({ acceptedCustomerDataTerms: true })).result.enhancedConversionsForLeads,
    ).toBe(false);
    expect((await prepare(undefined)).result.enhancedConversionsForLeads).toBe(false);
  });
});
