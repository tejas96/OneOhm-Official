import { describe, expect, it } from 'vitest';
import { measureDay } from './travel-measure';
import { startPlaceCheck, suggestBase } from './travel-start';

const home = { latitude: 19.0, longitude: 72.8 };
const office = { latitude: 19.3, longitude: 72.9 };
// About 0.009 degrees of latitude is a kilometre.
const kmNorth = (from: { latitude: number; longitude: number }, km: number) => ({
  latitude: from.latitude + km * 0.009,
  longitude: from.longitude,
});

describe('startPlaceCheck', () => {
  const check = (start: typeof home, base: typeof home | null, offices = [office]) =>
    startPlaceCheck({ start, base, offices, maxKm: 5 });

  it('knows a start near the base', () => {
    expect(check(kmNorth(home, 3), home)).toBe('known');
  });

  it('knows a start near an office, with or without a base', () => {
    expect(check(kmNorth(office, 1), home)).toBe('known');
    expect(check(kmNorth(office, 1), null)).toBe('known');
  });

  it('is far from base when it is away from the base and from every office', () => {
    expect(check(kmNorth(home, 20), home)).toBe('far_from_base');
  });

  it('is an unknown place when there is no base and no office is near', () => {
    expect(check(kmNorth(home, 20), null)).toBe('unknown_place');
    expect(check(home, null, [])).toBe('unknown_place');
  });

  it('holds the limit at the km given', () => {
    expect(startPlaceCheck({ start: kmNorth(home, 4), base: home, offices: [], maxKm: 5 })).toBe(
      'known',
    );
    expect(startPlaceCheck({ start: kmNorth(home, 6), base: home, offices: [], maxKm: 5 })).toBe(
      'far_from_base',
    );
  });
});

describe('suggestBase', () => {
  it('is the median of the starts, so one odd day does not move it', () => {
    const starts = [home, home, kmNorth(home, 0.1), kmNorth(home, 40)];
    const middle = suggestBase(starts);
    expect(middle?.latitude).toBeLessThan(home.latitude + 0.002);
  });

  it('is null with no starts', () => {
    expect(suggestBase([])).toBeNull();
  });
});

describe('a day from home to a site and back', () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 16, 4, minute)).toISOString();
  const site = kmNorth(home, 10);
  const stops = [
    { id: 'start', kind: 'start', label: 'Check-in', at: at(0), point: home },
    { id: 'v', kind: 'visit', label: 'Site', at: at(30), point: site },
    { id: 'end', kind: 'end', label: 'Check-out', at: at(120), point: home },
  ] as const;
  const day = (over: { visits?: number; commuteDeductM?: number } = {}) =>
    measureDay({
      stops,
      points: [],
      ratePaisePerKm: 500,
      visits: over.visits ?? 1,
      capRatio: 1.6,
      commuteDeductM: over.commuteDeductM ?? 0,
    });

  it('measures the straight line from home through the site and back', () => {
    expect(day().summary.distanceM).toBeGreaterThan(19_000);
    expect(day().paid.paidM).toBe(day().summary.distanceM);
  });

  it('takes the commute off the paid km, not the straight line', () => {
    const less = day({ commuteDeductM: 2_000 });
    expect(less.summary.distanceM).toBe(day().summary.distanceM);
    expect(less.paid.paidM).toBe(day().paid.paidM - 2_000);
    expect(less.paid.commuteDeductM).toBe(2_000);
  });

  it('pays nothing with no site visit', () => {
    expect(day({ visits: 0 }).paid).toMatchObject({ paidM: 0, noVisits: true });
  });
});
