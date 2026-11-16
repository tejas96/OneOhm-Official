import { describe, expect, it } from 'vitest';
import { dayStops, findStays, placeOf, type StopPoint } from './stops';

const T0 = new Date('2026-11-16T04:00:00Z');
const DEG_PER_M = 1 / 111_195;
const HOME = { latitude: 16.85, longitude: 74.58 };
const at = (minute: number, metresNorth = 0): StopPoint => ({
  recordedAt: new Date(T0.getTime() + minute * 60_000),
  latitude: HOME.latitude + metresNorth * DEG_PER_M,
  longitude: HOME.longitude,
});
/** A point every 2 minutes from `from` to `to`, `metresNorth` of home. */
const still = (from: number, to: number, metresNorth: number) =>
  Array.from({ length: Math.floor((to - from) / 2) + 1 }, (_, i) =>
    at(from + i * 2, metresNorth + (i % 2) * 15),
  );
const office = { id: 'o1', name: 'Head office', ...HOME, radiusM: 120 };
const site = { id: 's1', label: 'Sharma home', ...at(0, 5000), radiusM: 150 };

describe('findStays', () => {
  it('finds a stay of 10 minutes or more within 100 m, and none shorter', () => {
    expect(findStays(still(0, 10, 0))).toHaveLength(1);
    expect(findStays(still(0, 8, 0))).toHaveLength(0);
  });

  it('splits two stays with a drive between them', () => {
    const drive = [at(32, 1500), at(34, 3000)];
    const stays = findStays([...still(0, 30, 0), ...drive, ...still(36, 60, 5000)]);
    expect(stays).toHaveLength(2);
    expect(stays[0]?.startAt).toEqual(at(0).recordedAt);
    expect(stays[1]?.endAt).toEqual(at(60).recordedAt);
  });

  it('ends a stay at a gap over 20 minutes, so a stay never hides a gap', () => {
    const stays = findStays([...still(0, 12, 0), ...still(40, 52, 0)]);
    expect(stays.map((stay) => [stay.startAt, stay.endAt])).toEqual([
      [at(0).recordedAt, at(12).recordedAt],
      [at(40).recordedAt, at(52).recordedAt],
    ]);
  });
});

describe('placeOf', () => {
  it('names an office first, then a site, else unknown', () => {
    expect(placeOf(HOME, [office], [site]).place).toBe('office');
    expect(placeOf(at(0, 5050), [office], [site])).toMatchObject({
      place: 'site',
      label: 'Sharma home',
      id: 's1',
    });
    expect(placeOf(at(0, 9000), [office], [site])).toEqual({
      place: 'unknown',
      label: null,
      id: null,
    });
  });
});

describe('dayStops', () => {
  const places = { offices: [office], sites: [site], unknownStopMinutes: 45 };

  it('flags an unknown stop of 45 minutes or more only', () => {
    const long = dayStops(still(0, 50, 9000), places);
    expect(long).toHaveLength(1);
    expect(long[0]).toMatchObject({ place: 'unknown', minutes: 50, flagged: true });
    expect(dayStops(still(0, 40, 9000), places)[0]?.flagged).toBe(false);
  });

  it('never flags a long stop at the office or a site', () => {
    expect(dayStops(still(0, 120, 0), places)[0]).toMatchObject({
      place: 'office',
      flagged: false,
    });
    expect(dayStops(still(0, 120, 5000), places)[0]).toMatchObject({
      place: 'site',
      flagged: false,
    });
  });

  it('follows the setting for how long an unknown stop may be', () => {
    const stops = dayStops(still(0, 30, 9000), { ...places, unknownStopMinutes: 30 });
    expect(stops[0]?.flagged).toBe(true);
  });

  it('names a stop at the person\'s base place "Home base", never flagged', () => {
    const base = { latitude: at(0, 9000).latitude, longitude: HOME.longitude };
    const [stop] = dayStops(still(0, 120, 9000), { ...places, base });
    expect(stop).toMatchObject({ place: 'office', placeLabel: 'Home base', flagged: false });
    expect(dayStops(still(0, 120, 9000), { ...places, base: null })[0]?.flagged).toBe(true);
  });

  it('counts only the points inside the duty window', () => {
    const points = still(0, 120, 9000);
    const window = { start: at(90).recordedAt, end: null };
    const [stop] = dayStops(points, { ...places, window });
    expect(stop).toMatchObject({ minutes: 30, flagged: false });
    expect(
      dayStops(points, {
        ...places,
        window: { start: at(0).recordedAt, end: at(30).recordedAt },
      })[0]?.minutes,
    ).toBe(30);
  });
});
