import { describe, expect, it } from 'vitest';
import { mapsOn } from './maps-enabled';

const extra = { mapsEnabledIos: true, mapsEnabledAndroid: false };

describe('mapsOn', () => {
  it('reads the flag for this platform only', () => {
    expect(mapsOn('ios', extra)).toBe(true);
    expect(mapsOn('android', extra)).toBe(false);
    expect(mapsOn('android', { mapsEnabledAndroid: true })).toBe(true);
  });
  it('is off on the web and without a flag', () => {
    expect(mapsOn('web', { mapsEnabledIos: true, mapsEnabledAndroid: true })).toBe(false);
    expect(mapsOn('ios', undefined)).toBe(false);
    expect(mapsOn('ios', { mapsEnabledIos: 'yes' })).toBe(false);
  });
});
