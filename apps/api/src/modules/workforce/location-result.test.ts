import type { WorkLocation } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { locationResultOf } from './location-result';

const location: WorkLocation = { id: 'o', name: 'Office', latitude: 0, longitude: 0, radiusM: 100 };
const match = (inside: boolean | null) => ({ location, distanceM: 50, inside });

describe('locationResultOf', () => {
  it('says why a reading was not kept', () => {
    for (const reason of ['no_reading', 'no_consent', 'policy_off', 'outside_hours'] as const)
      expect(locationResultOf(reason, null)).toEqual({ saved: false, reason, fence: null });
  });

  it('says where a kept reading stood, with unsure for poor accuracy', () => {
    expect(locationResultOf(null, match(true))).toEqual({
      saved: true,
      reason: null,
      fence: 'inside',
    });
    expect(locationResultOf(null, match(false)).fence).toBe('outside');
    expect(locationResultOf(null, match(null)).fence).toBe('unsure');
    expect(locationResultOf(null, null).fence).toBeNull();
  });
});
