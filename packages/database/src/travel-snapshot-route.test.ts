import { beforeEach, describe, expect, it, vi } from 'vitest';

const lib = vi.hoisted(() => ({ alertJobFailed: vi.fn(async () => 1) }));
vi.mock('./job-alerts', () => lib);

import { ensureTravelSnapshot, takeTravelSnapshot } from './travel-snapshot';
import { dayRow, fakeDb, place, policy, visit } from './travel-snapshot-test-kit';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('takeTravelSnapshot with a recorded route', () => {
  const FAR = 0.0009; // about 100 m of latitude per step
  const points = (count: number, mocked = false) =>
    Array.from({ length: count }, (_, index) => ({
      recordedAt: new Date(Date.parse('2026-11-15T05:00:00Z') + index * 60_000),
      latitude: 18.52 + index * FAR * 3,
      longitude: 73.85,
      accuracyM: 10,
      mocked,
    }));
  const queue = (route: unknown[]) => [
    [dayRow()],
    [visit('a', '2026-11-15T06:00:00Z', 18.56, 73.9)],
    [place],
    [],
    [policy(900)],
    route,
  ];

  it('pays the route, saves how it was worked out, and keeps distance_m equal to the paid km', async () => {
    const { db, writes } = fakeDb(queue(points(10)));
    await takeTravelSnapshot(db, 'u1', '2026-11-15');
    const saved = writes[0]?.values as Record<string, number | string | boolean>;
    expect(saved.method).toBe('route');
    expect(saved.pointsCount).toBe(10);
    expect(saved.routeM).toBeGreaterThan(2000);
    expect(saved.straightM).toBeGreaterThan(0);
    expect(saved.distanceM).toBe(saved.paidM);
    expect(saved.paidM).toBeLessThanOrEqual(Math.round(Number(saved.straightM) * 1.6));
    expect(saved.capApplied).toBe(false);
  });

  it('pays the straight line when no point was recorded', async () => {
    const { db, writes } = fakeDb(queue([]));
    await takeTravelSnapshot(db, 'u1', '2026-11-15');
    expect(writes[0]?.values).toMatchObject({ method: 'straight', routeM: 0, pointsCount: 0 });
    expect(writes[0]?.values?.paidM).toBe(writes[0]?.values?.straightM);
  });

  it('counts mocked points and falls back to the straight line', async () => {
    const { db, writes } = fakeDb(queue(points(5, true)));
    await takeTravelSnapshot(db, 'u1', '2026-11-15');
    expect(writes[0]?.values).toMatchObject({ method: 'straight', mockedCount: 5 });
  });

  it('pays nothing for a day with a route but no site visit', async () => {
    const noVisits = [[dayRow()], [], [place], [], [policy(900)], points(10)];
    const { db, writes } = fakeDb(noVisits);
    await takeTravelSnapshot(db, 'u1', '2026-11-15');
    expect(writes[0]?.values).toMatchObject({ paidM: 0, distanceM: 0, visits: 0 });
  });

  it('counts the silence from check-in to the first point and from the last point to check-out', async () => {
    // Checked in 04:00, first point 05:00, ten points a minute apart, checked out 12:00.
    const { db, writes } = fakeDb(queue(points(10)));
    await takeTravelSnapshot(db, 'u1', '2026-11-15');
    expect(writes[0]?.values).toMatchObject({ gapCount: 2 });
    expect(Number(writes[0]?.values?.gapMinutes)).toBeGreaterThan(400);
  });

  it('still closes the day when the claim step fails, keeps the fault and tells the admin once a day', async () => {
    const { db, writes, audits } = fakeDb(queue(points(10)), { failSettle: true });
    const saved = await takeTravelSnapshot(db, 'u1', '2026-11-15');
    expect(saved).not.toBeNull();
    expect(writes).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'travel_claim.settle_failed',
      entity: 'travel_day',
      data: expect.objectContaining({ userId: 'u1', workDate: '2026-11-15' }),
    });
    expect(lib.alertJobFailed).toHaveBeenCalledWith(
      expect.anything(),
      'travel_claim',
      expect.any(Error),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  });

  it('settles the day’s claim at a close, not at a backfill', async () => {
    const close = fakeDb(queue([]));
    await takeTravelSnapshot(close.db, 'u1', '2026-11-15');
    expect(close.settled).toHaveLength(1);
    const backfill = fakeDb(queue([]));
    await takeTravelSnapshot(backfill.db, 'u1', '2026-11-15', new Date(), 'backfill');
    expect(backfill.settled).toHaveLength(0);
  });
});

describe('ensureTravelSnapshot (S4)', () => {
  it('returns the saved day without measuring', async () => {
    const saved = { distanceM: 5 };
    const { db, writes } = fakeDb([[saved]]);
    expect(await ensureTravelSnapshot(db, 'u1', '2026-11-15')).toBe(saved);
    expect(writes).toHaveLength(0);
  });

  it('marks a day closed before snapshots existed, saved now, as a backfill', async () => {
    // Nothing saved yet, then the closed day as the live rows have it.
    const { db, writes } = fakeDb([[], [dayRow()], [], [place], [], [policy(900)]]);
    await ensureTravelSnapshot(db, 'u1', '2026-11-15');
    expect(writes[0]?.values?.source).toBe('backfill');
  });
});
