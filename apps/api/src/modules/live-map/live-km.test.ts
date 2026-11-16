import type { DatabaseExecutor } from '@oneohm/database';
import { describe, expect, it } from 'vitest';
import { DayKmCache } from './live-km';
import type { DayRow, PointRow } from './live-read';

const start = new Date('2026-11-16T04:00:00Z');
const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
const point = (minutes: number, km: number, mocked = false) =>
  ({
    id: `p${minutes}`,
    attendanceDayId: 'd1',
    recordedAt: at(minutes),
    latitude: 16.85 + km / 111.195,
    longitude: 74.58,
    accuracyM: 10,
    mocked,
  }) as PointRow;
const day: DayRow = {
  id: 'd1',
  userId: 'w1',
  workDate: '2026-11-16',
  checkInAt: at(-1),
  checkOutAt: null,
};

/** A stand-in for the one query the cache makes; counts how often it runs. */
function fakeDb(points: PointRow[]) {
  const calls = { count: 0 };
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: async () => {
      calls.count += 1;
      return points;
    },
  };
  return { db: { select: () => chain } as unknown as DatabaseExecutor, calls };
}

describe('DayKmCache', () => {
  it('measures a day once a minute, in one read, and flags mocked points', async () => {
    const { db, calls } = fakeDb([point(0, 0), point(5, 2), point(10, 4, true), point(15, 6)]);
    const cache = new DayKmCache();
    const first = await cache.get(db, [day], at(16), 'Asia/Kolkata');
    expect(first.get('d1')?.km).toBeCloseTo(6, 1);
    expect(first.get('d1')?.mockedToday).toBe(true);
    await cache.get(db, [day], at(16.5), 'Asia/Kolkata');
    expect(calls.count).toBe(1);
    await cache.get(db, [day], at(17.1), 'Asia/Kolkata');
    expect(calls.count).toBe(2);
  });

  it('measures again at once when the day ends', async () => {
    const { db, calls } = fakeDb([point(0, 0), point(5, 2)]);
    const cache = new DayKmCache();
    await cache.get(db, [day], at(6), 'Asia/Kolkata');
    await cache.get(db, [{ ...day, checkOutAt: at(6) }], at(6.2), 'Asia/Kolkata');
    expect(calls.count).toBe(2);
  });
});
