import { describe, expect, it } from 'vitest';
import { campaignLabel } from './campaign-label';

describe('campaignLabel', () => {
  it('prefers the campaign name, then the code', () => {
    expect(campaignLabel({ campaignCode: 'DIWALI26', campaignName: 'Diwali offer' })).toBe(
      'Diwali offer',
    );
    expect(campaignLabel({ campaignCode: 'DIWALI26', adHeadline: 'Solar sale' })).toBe('DIWALI26');
  });

  it('falls to the ad headline, then "ad <id>", then the UTM campaign', () => {
    expect(campaignLabel({ adId: '9', adHeadline: 'Solar sale', utmCampaign: 'x' })).toBe(
      'Solar sale',
    );
    expect(campaignLabel({ adId: '9', utmCampaign: 'x' })).toBe('ad 9');
    expect(campaignLabel({ utmCampaign: 'spring' })).toBe('spring');
  });

  it('is null when nothing is known', () => {
    expect(campaignLabel({})).toBeNull();
  });
});
