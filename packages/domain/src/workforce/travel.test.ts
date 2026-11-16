import { describe, expect, it } from 'vitest';
import {
  claimBlocker,
  orderStops,
  summariseTravel,
  type TravelStop,
  travelLegs,
  unlocatedStops,
} from './travel';

const stop = (
  id: string,
  at: string,
  point: TravelStop['point'],
  kind: TravelStop['kind'] = 'visit',
): TravelStop => ({ id, kind, label: id.toUpperCase(), at, point });

const OFFICE = { latitude: 18.52, longitude: 73.85 };
const SITE_A = { latitude: 18.56, longitude: 73.9 };
const SITE_B = { latitude: 18.6, longitude: 73.95 };

describe('travelLegs (S2)', () => {
  it('pays both sides of a stop that has no location', () => {
    const stops = [
      stop('office', '2026-11-15T04:00Z', OFFICE, 'start'),
      stop('a', '2026-11-15T05:00Z', null),
      stop('b', '2026-11-15T07:00Z', SITE_B),
    ];
    const legs = travelLegs(stops);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ fromId: 'office', toId: 'b' });
    expect(legs[0]?.distanceM).toBeGreaterThan(0);
  });

  it('connects the previous located stop to the next located stop across several gaps', () => {
    const stops = [
      stop('office', '1', OFFICE, 'start'),
      stop('x', '2', null),
      stop('y', '3', null),
      stop('a', '4', SITE_A),
      stop('z', '5', null),
      stop('home', '6', OFFICE, 'end'),
    ];
    expect(travelLegs(stops).map((leg) => [leg.fromId, leg.toId])).toEqual([
      ['office', 'a'],
      ['a', 'home'],
    ]);
  });

  it('never returns a leg without a distance', () => {
    const stops = [stop('a', '1', null), stop('b', '2', null)];
    expect(travelLegs(stops)).toEqual([]);
  });

  it('lists the stops it skipped so they can still be shown', () => {
    const stops = [stop('a', '1', SITE_A), stop('b', '2', null)];
    expect(unlocatedStops(stops).map((one) => one.id)).toEqual(['b']);
  });
});

describe('summariseTravel (S3, S4)', () => {
  const stops = orderStops([
    stop('office', '1', OFFICE, 'start'),
    stop('a', '2', SITE_A),
    stop('home', '9', OFFICE, 'end'),
  ]);

  it('keeps the rate and visit count it was given', () => {
    const summary = summariseTravel(stops, 700, 1);
    expect(summary.ratePaisePerKm).toBe(700);
    expect(summary.visits).toBe(1);
    expect(summary.legs).toHaveLength(2);
    expect(summary.distanceM).toBe(
      summary.legs.reduce((sum, leg) => sum + (leg.distanceM ?? 0), 0),
    );
  });

  it('is zero with no site visits, even with an office start and end', () => {
    expect(summariseTravel(stops, 700, 0)).toMatchObject({ distanceM: 0, legs: [] });
  });
});

describe('claimBlocker (S5)', () => {
  const base = { closed: true, amountPaise: 500, live: false, future: false };
  it('allows a closed day with travel', () => expect(claimBlocker(base)).toBeNull());
  it('refuses a day that is still open', () =>
    expect(claimBlocker({ ...base, closed: false })).toBe('open_day'));
  it('refuses a future day first', () =>
    expect(claimBlocker({ ...base, closed: false, future: true })).toBe('future'));
  it('refuses a day already claimed', () =>
    expect(claimBlocker({ ...base, live: true })).toBe('claimed'));
  it('refuses a day with nothing to pay', () =>
    expect(claimBlocker({ ...base, amountPaise: 0 })).toBe('no_travel'));
});
