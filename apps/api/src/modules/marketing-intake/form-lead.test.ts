import type { PlatformLead } from '@oneohm/marketing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const alerts = vi.hoisted(() => ({ alertNoPhone: vi.fn(), alertTestLead: vi.fn() }));
vi.mock('./lead-alerts', () => alerts);
vi.mock('./ad-lookup', () => ({
  campaignOfMetaAd: async () => ({ id: 'c1', code: 'DIWALI26', city: 'Pune', adName: 'Ad' }),
  campaignOfGoogle: async () => null,
  leadWithPlatformId: async () => false,
  settingsCity: async () => 'Pune',
}));

import { PermanentEventError } from './event-flow';
import { readMetaLead, saveFormLead } from './form-lead';

const lead: PlatformLead = {
  platformLeadId: '555',
  name: 'Asha',
  phone: '+919876543210',
  email: null,
  city: null,
  adId: 'ad-1',
  campaignExternalId: null,
  formId: null,
  platform: 'instagram',
  gclid: null,
  createdAt: new Date(),
  isTest: false,
};
const intake = { receive: vi.fn(async () => ({ leadId: 'l1' })) };

beforeEach(() => vi.clearAllMocks());

describe('saving a lead form entry', () => {
  it('makes a lead for a real entry', async () => {
    expect(await saveFormLead({} as never, intake as never, lead, 'meta', 'meta:lead:555')).toBe(
      'created',
    );
    expect(intake.receive).toHaveBeenCalledOnce();
  });

  it('makes a notice, not a lead, for a test lead', async () => {
    const outcome = await saveFormLead(
      {} as never,
      intake as never,
      { ...lead, isTest: true },
      'meta',
      'meta:lead:555',
    );
    expect(outcome).toBe('test');
    expect(alerts.alertTestLead).toHaveBeenCalledOnce();
    expect(intake.receive).not.toHaveBeenCalled();
  });

  it('alerts the leads desk, with the campaign, when there is no Indian mobile number', async () => {
    const outcome = await saveFormLead(
      {} as never,
      intake as never,
      { ...lead, phone: '12345' },
      'meta',
      'meta:lead:555',
    );
    expect(outcome).toBe('no_phone');
    expect(alerts.alertNoPhone).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ phone: '12345' }),
      expect.objectContaining({ code: 'DIWALI26' }),
      'meta:lead:555',
    );
    expect(intake.receive).not.toHaveBeenCalled();
  });
});

describe('reading a Meta lead', () => {
  it('is a failure waiting cannot fix when Meta is not connected', async () => {
    await expect(readMetaLead(null, { leadgenId: '1' })).rejects.toBeInstanceOf(
      PermanentEventError,
    );
  });
});
