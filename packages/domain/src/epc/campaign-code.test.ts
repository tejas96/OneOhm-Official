import { describe, expect, it } from 'vitest';
import { findCampaignCode } from './campaign-code';

describe('findCampaignCode', () => {
  it('reads the code from the ad opener, uppercased', () => {
    expect(findCampaignCode('Hi OneOhm DIWALI26')).toBe('DIWALI26');
    expect(findCampaignCode('hello oneohm  poster-1 ')).toBe('POSTER-1');
    expect(findCampaignCode('oneohm flyer_2')).toBe('FLYER_2');
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
