import type { LocationObject } from 'expo-location';
import { describe, expect, it } from 'vitest';
import { dutyPointOf, newPointId } from './duty-point';

const device = { batteryPercent: 61, charging: false, network: 'cellular' as const };
const fix = (over: Partial<LocationObject['coords']> = {}, mocked?: boolean): LocationObject => ({
  coords: {
    latitude: 16.85,
    longitude: 74.58,
    altitude: 540.5,
    accuracy: 18,
    altitudeAccuracy: 4,
    heading: 90,
    speed: 3.2,
    ...over,
  },
  timestamp: Date.UTC(2026, 10, 16, 4, 30, 0),
  ...(mocked === undefined ? {} : { mocked }),
});

describe('a route point from a reading', () => {
  it('uses the reading’s own time and the device state', () => {
    expect(dutyPointOf(fix(), device, 'id-1')).toEqual({
      id: 'id-1',
      recordedAt: '2026-11-16T04:30:00.000Z',
      latitude: 16.85,
      longitude: 74.58,
      accuracyM: 18,
      speedMps: 3.2,
      headingDeg: 90,
      altitudeM: 540.5,
      mocked: false,
      batteryPercent: 61,
      charging: false,
      network: 'cellular',
    });
  });

  it('turns the phone’s -1 for "unknown" into null, and keeps the mock flag', () => {
    const point = dutyPointOf(fix({ speed: -1, heading: -1, accuracy: -1 }, true), device);
    expect(point).toMatchObject({
      speedMps: null,
      headingDeg: null,
      accuracyM: null,
      mocked: true,
    });
  });
});

describe('a point id', () => {
  it('is a version 4 uuid and differs each time', () => {
    const a = newPointId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newPointId()).not.toBe(a);
  });
});
