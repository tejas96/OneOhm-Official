import { describe, expect, it } from 'vitest';
import { DEFAULT_ONBOARDING, isOnboardingSettings } from './settings';

const bands = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `b${i}`, label: `B${i}`, targetWp: 1000 * (i + 1) }));

describe('isOnboardingSettings', () => {
  it('accepts the defaults', () => {
    expect(isOnboardingSettings(DEFAULT_ONBOARDING)).toBe(true);
    expect(DEFAULT_ONBOARDING.billBands).toHaveLength(5);
  });
  it('rejects 1 band and 10 bands', () => {
    expect(isOnboardingSettings({ ...DEFAULT_ONBOARDING, billBands: bands(1) })).toBe(false);
    expect(isOnboardingSettings({ ...DEFAULT_ONBOARDING, billBands: bands(10) })).toBe(false);
    expect(isOnboardingSettings({ ...DEFAULT_ONBOARDING, billBands: bands(9) })).toBe(true);
  });
  it('rejects a negative tariff and a non-positive targetWp', () => {
    expect(isOnboardingSettings({ ...DEFAULT_ONBOARDING, tariffPaisePerUnit: -1 })).toBe(false);
    const zero = [{ id: 'a', label: 'A', targetWp: 0 }, ...bands(2)];
    expect(isOnboardingSettings({ ...DEFAULT_ONBOARDING, billBands: zero })).toBe(false);
  });
  it('rejects duplicate band ids, a bad nudge and non-objects', () => {
    const dup = [...bands(1), ...bands(1)];
    expect(isOnboardingSettings({ ...DEFAULT_ONBOARDING, billBands: dup })).toBe(false);
    expect(isOnboardingSettings({ ...DEFAULT_ONBOARDING, nudgeAfterHours: -1 })).toBe(false);
    expect(isOnboardingSettings(null)).toBe(false);
  });
  it('caps the nudge at 23 hours, so the nudge and the stalled lead stay inside a day', () => {
    expect(isOnboardingSettings({ ...DEFAULT_ONBOARDING, nudgeAfterHours: 23 })).toBe(true);
    expect(isOnboardingSettings({ ...DEFAULT_ONBOARDING, nudgeAfterHours: 24 })).toBe(false);
  });
  it('allows 8 cities and rejects 9, since the list also carries two other rows', () => {
    const cities = (n: number) => Array.from({ length: n }, (_, i) => `City${i}`);
    expect(isOnboardingSettings({ ...DEFAULT_ONBOARDING, serviceCities: cities(8) })).toBe(true);
    expect(isOnboardingSettings({ ...DEFAULT_ONBOARDING, serviceCities: cities(9) })).toBe(false);
  });
  it('caps city names and band labels at 24 characters', () => {
    const at = { ...DEFAULT_ONBOARDING, serviceCities: ['a'.repeat(24)] };
    expect(isOnboardingSettings(at)).toBe(true);
    expect(isOnboardingSettings({ ...at, serviceCities: ['a'.repeat(25)] })).toBe(false);
    const band = (label: string) => [
      { id: 'x', label, targetWp: 1000, maxRupees: 1000 },
      { id: 'y', label: 'Y', targetWp: null, maxRupees: null },
    ];
    expect(isOnboardingSettings({ ...DEFAULT_ONBOARDING, billBands: band('b'.repeat(24)) })).toBe(
      true,
    );
    expect(isOnboardingSettings({ ...DEFAULT_ONBOARDING, billBands: band('b'.repeat(25)) })).toBe(
      false,
    );
  });
  it('needs rising band limits with "no limit" only last', () => {
    const [a, b, c] = DEFAULT_ONBOARDING.billBands;
    const last = DEFAULT_ONBOARDING.billBands[4];
    if (!a || !b || !c || !last) throw new Error('defaults changed');
    expect(isOnboardingSettings({ ...DEFAULT_ONBOARDING, billBands: [b, a, c, last] })).toBe(false);
    expect(isOnboardingSettings({ ...DEFAULT_ONBOARDING, billBands: [a, last, b] })).toBe(false);
    expect(
      isOnboardingSettings({ ...DEFAULT_ONBOARDING, billBands: [a, { ...b, maxRupees: 1000 }] }),
    ).toBe(false);
  });
});
