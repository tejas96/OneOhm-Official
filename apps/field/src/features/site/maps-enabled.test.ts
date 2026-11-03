import { describe, expect, it } from 'vitest';
import { mapsOn } from './maps-enabled';

const extra = { mapsEnabledIos: true, mapsEnabledAndroid: false };

describe('mapsOn', () => {
  it('reads the flag for this platform only', () => {
    expect(mapsOn('ios', extra, '26.5')).toBe(true);
    expect(mapsOn('android', extra, 36)).toBe(false);
    expect(mapsOn('android', { mapsEnabledAndroid: true }, 36)).toBe(true);
  });
  it('needs iOS 17 or later for Apple Maps', () => {
    expect(mapsOn('ios', extra, '17.0')).toBe(true);
    expect(mapsOn('ios', extra, '16.7.2')).toBe(false);
    expect(mapsOn('ios', extra)).toBe(false);
  });
  it('is off on the web and without a flag', () => {
    expect(mapsOn('web', { mapsEnabledIos: true, mapsEnabledAndroid: true }, '')).toBe(false);
    expect(mapsOn('ios', undefined, '18.0')).toBe(false);
    expect(mapsOn('ios', { mapsEnabledIos: 'yes' }, '18.0')).toBe(false);
  });
});
