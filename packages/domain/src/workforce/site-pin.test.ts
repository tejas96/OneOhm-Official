import { describe, expect, it } from 'vitest';
import { judgeSitePin, type LocationSource, locationChange } from './site-pin';

const reading = { latitude: 16.8524, longitude: 74.5815, accuracyM: 8 };

describe('judgeSitePin', () => {
  it('trusts a pin within the limit', () => {
    const pin = { latitude: 16.853, longitude: 74.5815 }; // ~67 m north
    expect(judgeSitePin(pin, reading, 100)).toEqual({ distanceM: 67, flagged: false });
  });
  it('flags a pin beyond the limit but returns its distance', () => {
    const pin = { latitude: 16.8546, longitude: 74.5815 }; // ~245 m
    expect(judgeSitePin(pin, reading, 100)).toMatchObject({ flagged: true });
    expect(judgeSitePin(pin, reading, 100).distanceM).toBeGreaterThan(200);
  });
  it('trusts a pin exactly at the limit and flags one a metre past it', () => {
    const pin = { latitude: 16.853, longitude: 74.5815 }; // 67 m
    expect(judgeSitePin(pin, reading, 67)).toEqual({ distanceM: 67, flagged: false });
    expect(judgeSitePin(pin, reading, 66)).toEqual({ distanceM: 67, flagged: true });
  });
  it('flags a pin with no reading to compare', () => {
    expect(judgeSitePin(reading, null, 100)).toEqual({ distanceM: null, flagged: true });
  });
  it('does not use phone accuracy as slack', () => {
    const pin = { latitude: 16.8535, longitude: 74.5815 }; // ~122 m
    expect(judgeSitePin(pin, { ...reading, accuracyM: 60 }, 100).flagged).toBe(true);
  });
});

describe('locationChange', () => {
  it.each<[LocationSource | null, LocationSource, 'fill' | 'replace' | 'ask']>([
    [null, 'gps', 'fill'],
    [null, 'address', 'fill'],
    [null, 'map_pin', 'fill'],
    ['gps', 'map_pin', 'replace'],
    ['gps', 'typed', 'replace'],
    ['gps', 'gps', 'ask'],
    ['map_pin', 'map_pin', 'replace'],
    ['typed', 'map_pin', 'replace'],
    ['map_pin', 'typed', 'replace'],
    ['map_pin', 'gps', 'ask'],
    ['map_pin', 'address', 'ask'],
    ['typed', 'address', 'ask'],
    ['address', 'gps', 'ask'],
    ['gps', 'address', 'ask'],
    ['address', 'map_pin', 'replace'],
  ])('current %s + incoming %s -> %s', (source, incoming, expected) => {
    const point = source ? { latitude: 1, longitude: 1 } : null;
    expect(locationChange({ point, source }, incoming)).toBe(expected);
  });
  it('treats a located property with unknown source (old data) as gps', () => {
    const point = { latitude: 1, longitude: 1 };
    expect(locationChange({ point, source: null }, 'address')).toBe('ask');
    expect(locationChange({ point, source: null }, 'map_pin')).toBe('replace');
  });
});
