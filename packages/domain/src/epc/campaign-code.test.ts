import { describe, expect, it } from 'vitest';
import { findCampaignCode } from './campaign-code';

describe('findCampaignCode', () => {
  it('reads the code from the ad opener, uppercased', () => {
    expect(findCampaignCode('Hi OneOhm DIWALI26')).toBe('DIWALI26');
    expect(findCampaignCode('hello oneohm  poster-1 ')).toBe('POSTER-1');
    expect(findCampaignCode('oneohm flyer_2')).toBe('FLYER_2');
  });

  it('ignores plain greeting words after oneohm', () => {
    for (const text of [
      'Hello OneOhm sir',
      'Hi OneOhm team',
      'oneohm please',
      'oneohm ji',
      'Hi OneOhm madam',
    ])
      expect(findCampaignCode(text)).toBeNull();
  });

  it('takes a plain word only when it is on the codes list', () => {
    const known = new Set(['SUMMER']);
    expect(findCampaignCode('Hi OneOhm summer', known)).toBe('SUMMER');
    expect(findCampaignCode('Hi OneOhm summer')).toBeNull();
    expect(findCampaignCode('Hi OneOhm sir', known)).toBeNull();
    expect(findCampaignCode('Hi OneOhm DIWALI26', known)).toBe('DIWALI26');
  });

  it('is null for plain greetings, the referral form and menu words', () => {
    expect(findCampaignCode('hi')).toBeNull();
    expect(findCampaignCode('Hi OneOhm')).toBeNull();
    expect(findCampaignCode('my code AB12CD')).toBeNull();
    expect(findCampaignCode('Hi OneOhm, my referral code is RAME7K2Q')).toBeNull();
    expect(findCampaignCode('menu')).toBeNull();
    expect(findCampaignCode('oneohm menu')).toBeNull();
  });
});
