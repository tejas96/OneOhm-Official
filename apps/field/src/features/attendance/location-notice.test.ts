import { describe, expect, it } from 'vitest';
import { locationNotice } from './location-notice';

describe('the location sentence', () => {
  it('says nothing when the reading was kept and inside', () => {
    expect(locationNotice({ saved: true, reason: null, fence: 'inside' }, null)).toBeNull();
    expect(locationNotice(undefined, null)).toBeNull();
  });
  it('puts what the phone knows first', () => {
    const result = { saved: false, reason: 'no_reading', fence: null } as const;
    expect(locationNotice(result, 'denied')).toMatch(/off for OneOhm/);
    expect(locationNotice(result, 'nofix')).toMatch(/could not be read/);
  });
  it('gives a reason for every reading that was not kept', () => {
    for (const reason of ['no_reading', 'no_consent', 'policy_off', 'outside_hours'] as const)
      expect(locationNotice({ saved: false, reason, fence: null }, null)).toBeTruthy();
  });
  it('is gentle about outside and unsure', () => {
    expect(locationNotice({ saved: true, reason: null, fence: 'outside' }, null)).toMatch(
      /away from/,
    );
    expect(locationNotice({ saved: true, reason: null, fence: 'unsure' }, null)).toMatch(
      /not sure/,
    );
  });
});
