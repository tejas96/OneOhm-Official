import { beforeEach, describe, expect, it, vi } from 'vitest';

const lib = vi.hoisted(() => ({ alertJobFailed: vi.fn(async () => 1) }));
vi.mock('./job-alerts', () => lib);

import { takeTravelSnapshot } from './travel-snapshot';
import { dayRow, fakeDb, place, policy, visit } from './travel-snapshot-test-kit';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('takeTravelSnapshot (S3, S4)', () => {
  it('saves nothing for a day that is still running', async () => {
    const { db, writes } = fakeDb([
      [dayRow({ checkOutAt: null })],
      [visit('a', '2026-11-15T06:00:00Z', 18.56, 73.9)],
      [],
      [],
    ]);
    expect(await takeTravelSnapshot(db, 'u1', '2026-11-15')).toBeNull();
    expect(writes).toHaveLength(0);
  });

  it('saves the distance, legs, visit count and the rate in force that day', async () => {
    const { db, writes } = fakeDb([
      [dayRow()],
      [
        visit('a', '2026-11-15T06:00:00Z', 18.56, 73.9),
        visit('b', '2026-11-15T08:00:00Z', null, null),
      ],
      [],
      [place],
      [],
      [policy(900)],
    ]);
    await takeTravelSnapshot(db, 'u1', '2026-11-15');
    const saved = writes[0]?.values as {
      distanceM: number;
      ratePaisePerKm: number;
      visits: number;
      legs: unknown[];
    };
    expect(saved.ratePaisePerKm).toBe(900);
    expect(saved.visits).toBe(2);
    // office -> a -> office: the visit with no location is skipped, not paid as zero (S2).
    expect(saved.legs).toHaveLength(2);
    expect(saved.distanceM).toBeGreaterThan(0);
  });

  it('marks a day saved as it closed with source close', async () => {
    const { db, writes } = fakeDb([[dayRow()], [], [], [place], [], [policy(900)]]);
    await takeTravelSnapshot(db, 'u1', '2026-11-15');
    expect(writes[0]?.values?.source).toBe('close');
  });

  it('keeps the rate a day was first saved with when it is measured again', async () => {
    const { db, writes } = fakeDb([
      [dayRow()],
      [visit('a', '2026-11-15T06:00:00Z', 18.56, 73.9)],
      [],
      [place],
      [{ ratePaisePerKm: 650, distanceM: 1, legs: [], visits: 1 }],
    ]);
    await takeTravelSnapshot(db, 'u1', '2026-11-15');
    expect(writes[0]?.values).toMatchObject({ ratePaisePerKm: 650 });
  });

  it('does not measure again from coordinates the retention sweep already cleared', async () => {
    const saved = { ratePaisePerKm: 650, distanceM: 12_000, legs: [], visits: 1 };
    const { db, writes } = fakeDb([
      [
        dayRow({
          locationClearedAt: new Date(),
          checkInLatitude: null,
          checkInLongitude: null,
          checkOutLatitude: null,
          checkOutLongitude: null,
        }),
      ],
      [visit('a', '2026-11-15T06:00:00Z', null, null)],
      [],
      [saved],
    ]);
    expect(await takeTravelSnapshot(db, 'u1', '2026-11-15')).toBe(saved);
    expect(writes).toHaveLength(0);
  });
});
