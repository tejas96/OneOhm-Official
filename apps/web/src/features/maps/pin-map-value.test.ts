import { describe, expect, it } from 'vitest';
import { pinMapValue } from './pin-map-value';

describe('pinMapValue', () => {
  it('reads typed coordinates into a point', () => {
    expect(pinMapValue.parse('16.8524', '74.5815')).toEqual({ lat: 16.8524, lng: 74.5815 });
    expect(pinMapValue.parse(' 16.8524 ', ' 74.5815')).toEqual({ lat: 16.8524, lng: 74.5815 });
  });

  it('gives null when either side is blank or not a number', () => {
    expect(pinMapValue.parse('', '74')).toBeNull();
    expect(pinMapValue.parse('16', '')).toBeNull();
    expect(pinMapValue.parse('abc', '74')).toBeNull();
  });

  it('gives null outside the earth', () => {
    expect(pinMapValue.parse('91', '0')).toBeNull();
    expect(pinMapValue.parse('-91', '0')).toBeNull();
    expect(pinMapValue.parse('0', '181')).toBeNull();
  });

  it('writes a point with 6 decimals', () => {
    expect(pinMapValue.format({ lat: 16.8524, lng: 74.5815 })).toEqual({
      latitude: '16.852400',
      longitude: '74.581500',
    });
    expect(pinMapValue.format({ lat: 16.12345678, lng: -74.98765432 })).toEqual({
      latitude: '16.123457',
      longitude: '-74.987654',
    });
  });

  it('turns nullable numbers into a point', () => {
    expect(pinMapValue.fromNumbers(16.7, 74.2)).toEqual({ lat: 16.7, lng: 74.2 });
    expect(pinMapValue.fromNumbers(null, 74.2)).toBeNull();
    expect(pinMapValue.fromNumbers(16.7, undefined)).toBeNull();
  });
});
