import type { PlatformLead } from '@oneohm/marketing';
import { describe, expect, it } from 'vitest';
import { formLeadInput } from './lead-mapping';

const lead: PlatformLead = {
  platformLeadId: '555',
  name: 'Asha Patil',
  phone: '+919876543210',
  email: null,
  city: null,
  adId: 'ad-1',
  campaignExternalId: null,
  formId: 'f1',
  platform: 'instagram',
  gclid: null,
  createdAt: new Date(),
  isTest: false,
};
const campaign = { id: 'c1', code: 'DIWALI26', city: 'Pune', adName: 'Solar for homes' };

describe('Meta lead form entry', () => {
  it('becomes a lead with the campaign, ad and platform id', () => {
    expect(formLeadInput(lead, campaign, 'Nashik', 'meta', 'ad-1')).toEqual({
      name: 'Asha Patil',
      phone: '+919876543210',
      city: 'Pune',
      source: 'instagram',
      nextActionNote: 'Call now: ad lead form',
      firstNote: 'Filled the Instagram lead form',
      attribution: {
        campaignCode: 'DIWALI26',
        adId: 'ad-1',
        adHeadline: 'Solar for homes',
        platformLeadId: 'meta:555',
      },
    });
  });

  it('uses their city first, then the settings city, then "Not given"', () => {
    expect(formLeadInput({ ...lead, city: 'Satara' }, campaign, 'Nashik', 'meta', null)?.city).toBe(
      'Satara',
    );
    expect(formLeadInput(lead, null, 'Nashik', 'meta', null)?.city).toBe('Nashik');
    expect(formLeadInput(lead, null, '', 'meta', null)?.city).toBe('Not given');
  });

  it('makes no lead without a usable phone', () => {
    expect(formLeadInput({ ...lead, phone: null }, campaign, '', 'meta', null)).toBeNull();
    expect(formLeadInput({ ...lead, phone: '12345' }, campaign, '', 'meta', null)).toBeNull();
  });
});

describe('Google lead form entry', () => {
  it('becomes a lead with the gclid and google platform id', () => {
    const google = {
      ...lead,
      platform: 'google' as const,
      gclid: 'G-1',
      platformLeadId: 'g9',
    };
    const input = formLeadInput(
      google,
      { id: 'c2', code: 'SOLAR-01', city: 'Pune', adName: null },
      '',
      'google',
      null,
    );
    expect(input).toMatchObject({
      source: 'google',
      nextActionNote: 'Call now: Google lead form',
      firstNote: 'Filled the Google lead form',
      attribution: { campaignCode: 'SOLAR-01', gclid: 'G-1', platformLeadId: 'google:g9' },
    });
  });
});
