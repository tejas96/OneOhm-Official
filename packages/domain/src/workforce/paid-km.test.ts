import { describe, expect, it } from 'vitest';
import { paidKm } from './paid-km';

const base = { capRatio: 1.6, keptPoints: 10, visits: 2 };
const plain = { noVisits: false, uncappedRoute: false, shortRoute: false, commuteDeductM: 0 };

describe('paidKm', () => {
  it('pays the route when it is within the cap', () => {
    expect(paidKm({ ...base, straightM: 14_200, routeM: 18_400 })).toEqual({
      ...plain,
      paidM: 18_400,
      method: 'route',
      capApplied: false,
    });
  });

  it('cuts the route to straight x ratio and says so', () => {
    expect(paidKm({ ...base, straightM: 10_000, routeM: 30_000 })).toEqual({
      ...plain,
      paidM: 16_000,
      method: 'route',
      capApplied: true,
    });
  });

  it('pays exactly the cap without calling it cut', () => {
    expect(paidKm({ ...base, straightM: 10_000, routeM: 16_000 }).capApplied).toBe(false);
  });

  it('never pays less than the straight line from 1 km, and says the route was short', () => {
    expect(paidKm({ ...base, straightM: 10_000, routeM: 7_000 })).toEqual({
      ...plain,
      paidM: 10_000,
      method: 'route',
      capApplied: false,
      shortRoute: true,
    });
    expect(paidKm({ ...base, straightM: 10_000, routeM: 10_000 }).shortRoute).toBe(false);
  });

  it('holds a day under 1 km straight to 2 km, and flags it as uncapped', () => {
    expect(paidKm({ ...base, straightM: 999, routeM: 5_000 })).toEqual({
      ...plain,
      paidM: 2_000,
      method: 'route',
      capApplied: false,
      uncappedRoute: true,
    });
    expect(paidKm({ ...base, straightM: 600, routeM: 1_200 }).paidM).toBe(1_200);
    expect(paidKm({ ...base, straightM: 1000, routeM: 5_000 })).toMatchObject({
      paidM: 1_600,
      capApplied: true,
      uncappedRoute: false,
    });
  });

  it('follows the ratio from the policy', () => {
    expect(paidKm({ ...base, capRatio: 1, straightM: 10_000, routeM: 12_000 }).paidM).toBe(10_000);
  });

  it('pays the straight line when there is no route', () => {
    expect(paidKm({ ...base, keptPoints: 0, straightM: 14_200, routeM: 0 })).toEqual({
      ...plain,
      paidM: 14_200,
      method: 'straight',
      capApplied: false,
    });
  });

  it('does not call one usable point a route', () => {
    expect(paidKm({ ...base, keptPoints: 1, straightM: 3_000, routeM: 0 }).method).toBe('straight');
  });

  it('pays nothing on a day with no site visit, whatever the route says', () => {
    for (const keptPoints of [0, 40])
      expect(paidKm({ ...base, visits: 0, keptPoints, straightM: 8_000, routeM: 30_000 })).toEqual({
        ...plain,
        paidM: 0,
        method: 'straight',
        capApplied: false,
        noVisits: true,
      });
  });

  it('takes the commute off once, after the cap', () => {
    const cut = paidKm({ ...base, straightM: 10_000, routeM: 30_000, commuteDeductM: 2_000 });
    expect(cut).toMatchObject({ paidM: 14_000, capApplied: true, commuteDeductM: 2_000 });
    const plainDay = paidKm({ ...base, straightM: 14_200, routeM: 19_100, commuteDeductM: 2_000 });
    expect(plainDay).toMatchObject({ paidM: 17_100, commuteDeductM: 2_000 });
  });

  it('never takes more off than was to be paid, and nothing off a day with no visit', () => {
    expect(paidKm({ ...base, straightM: 600, routeM: 900, commuteDeductM: 2_000 })).toMatchObject({
      paidM: 0,
      commuteDeductM: 900,
    });
    expect(
      paidKm({ ...base, visits: 0, straightM: 9_000, routeM: 9_000, commuteDeductM: 2_000 }),
    ).toMatchObject({ paidM: 0, noVisits: true, commuteDeductM: 0 });
  });

  it('takes the commute off a straight-line day too', () => {
    expect(
      paidKm({ ...base, keptPoints: 0, straightM: 9_000, routeM: 0, commuteDeductM: 2_000 }),
    ).toMatchObject({ paidM: 7_000, method: 'straight', commuteDeductM: 2_000 });
  });
});
