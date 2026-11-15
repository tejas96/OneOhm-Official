import { describe, expect, it } from 'vitest';
import { readGoogleLeadWebhook } from './google-leads';

const post = {
  lead_id: 'L-1',
  api_version: '1.0',
  form_id: 55,
  campaign_id: 777,
  adgroup_id: 1,
  creative_id: 2,
  gcl_id: 'gclid-9',
  google_key: 'key-1',
  is_test: true,
  lead_submit_time: '2026-11-14T10:00:00.000Z',
  user_column_data: [
    { column_id: 'FULL_NAME', string_value: 'Ravi Kumar' },
    { column_id: 'PHONE_NUMBER', string_value: '98765 43210' },
    { column_id: 'CITY', string_value: 'Pune' },
    { column_id: 'EMAIL', string_value: 'ravi@example.com' },
  ],
};

describe('readGoogleLeadWebhook', () => {
  it('reads the lead and its key', () => {
    const read = readGoogleLeadWebhook(post);
    expect(read?.key).toBe('key-1');
    expect(read?.lead).toEqual({
      platformLeadId: 'L-1',
      name: 'Ravi Kumar',
      phone: '+919876543210',
      email: 'ravi@example.com',
      city: 'Pune',
      adId: '2',
      campaignExternalId: '777',
      formId: '55',
      platform: 'google',
      gclid: 'gclid-9',
      createdAt: new Date('2026-11-14T10:00:00.000Z'),
      isTest: true,
    });
  });

  it('keeps a number that already has a country code', () => {
    const read = readGoogleLeadWebhook({
      ...post,
      user_column_data: [{ column_id: 'PHONE_NUMBER', string_value: '+91 98765-43210' }],
    });
    expect(read?.lead.phone).toBe('+919876543210');
    expect(read?.lead.name).toBeNull();
  });

  it('returns null for anything else and never throws', () => {
    for (const bad of [null, undefined, 'x', 5, [], {}, { lead_id: 'a' }, { google_key: 'k' }]) {
      expect(readGoogleLeadWebhook(bad)).toBeNull();
    }
    expect(
      readGoogleLeadWebhook({ ...post, user_column_data: 'nope', lead_submit_time: 'bad' }),
    ).not.toBeNull();
  });
});
