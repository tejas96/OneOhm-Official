import { describe, expect, it } from 'vitest';
import { adLeadAlert, arrivalKey, cameFromAd } from './lead-ad-alert';

const db = (rows: object[]) =>
  ({ select: () => ({ from: () => ({ where: () => ({ limit: async () => rows }) }) }) }) as never;

describe('ad lead alert', () => {
  it('says to call within 5 minutes', () => {
    expect(adLeadAlert({ name: 'Asha', city: 'Pune', from: 'Diwali 26' })).toEqual({
      title: 'New ad lead · call now',
      body: 'Asha, Pune. From Diwali 26. Call within 5 minutes: ad leads go cold fast.',
    });
  });

  it('says a person already on file came back from an ad', () => {
    const words = adLeadAlert({ name: 'Asha', city: 'Pune', from: 'Diwali 26', cameBack: true });
    expect(words.title).toBe('Asha came back from an ad · call now');
    expect(words.body).toContain('From Diwali 26.');
  });

  it('knows an ad lead by Google, ids, or a Marketing campaign code', async () => {
    expect(await cameFromAd(db([]), 'google', undefined)).toBe(true);
    expect(await cameFromAd(db([]), 'whatsapp', { ctwaClid: 'c' })).toBe(true);
    expect(await cameFromAd(db([]), 'website', { campaignCode: 'X1' })).toBe(false);
    expect(await cameFromAd(db([{ id: 'm1' }]), 'website', { campaignCode: 'X1' })).toBe(true);
    expect(await cameFromAd(db([]), 'website', undefined)).toBe(false);
  });

  it('counts Instagram and Facebook as an ad only with an ad id or a lead form id', async () => {
    expect(await cameFromAd(db([]), 'instagram', undefined)).toBe(false);
    expect(await cameFromAd(db([]), 'facebook', {})).toBe(false);
    expect(await cameFromAd(db([]), 'instagram', { adId: 'a1' })).toBe(true);
    expect(await cameFromAd(db([]), 'facebook', { platformLeadId: 'meta:9' })).toBe(true);
  });

  it('keys an alert by arrival, so an earlier one the same day does not swallow it', () => {
    expect(arrivalKey({ firstNote: 'x', attribution: { platformLeadId: 'meta:9' } })).toBe(
      'meta:9',
    );
    expect(arrivalKey({ firstNote: 'Wrote: "one"' })).not.toBe(
      arrivalKey({ firstNote: 'Wrote: "two"' }),
    );
    expect(arrivalKey({ firstNote: 'same' })).toBe(arrivalKey({ firstNote: 'same' }));
  });
});
