import { describe, expect, it } from 'vitest';
import { ensureTravelSnapshot, takeTravelSnapshot } from './travel-snapshot';

/** A drizzle-like handle: each `select()` takes the next queued result; writes are recorded. */
function fakeDb(queue: unknown[][]) {
  const writes: { values?: Record<string, unknown> }[] = [];
  const link = (rows: unknown[]): unknown =>
    new Proxy(
      {},
      {
        get: (_, key) =>
          key === 'then' ? (ok: (value: unknown[]) => void) => ok(rows) : () => link(rows),
      },
    );
  const db = {
    select: () => link(queue.shift() ?? []),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        const write: { values?: Record<string, unknown> } = { values };
        writes.push(write);
        return { onConflictDoUpdate: () => link([{ ...values, id: 'row' }]) };
      },
    }),
  };
  return { db: db as never, writes };
}

const OFFICE = { latitude: 18.52, longitude: 73.85 };
const dayRow = (patch: Record<string, unknown> = {}) => ({
  day: {
    checkInAt: new Date('2026-11-15T04:00:00Z'),
    checkInLatitude: OFFICE.latitude,
    checkInLongitude: OFFICE.longitude,
    checkInInside: true,
    checkOutAt: new Date('2026-11-15T12:00:00Z'),
    checkOutLatitude: OFFICE.latitude,
    checkOutLongitude: OFFICE.longitude,
    checkOutInside: true,
    locationClearedAt: null,
    ...patch,
  },
  place: 'Office',
});
const visit = (id: string, at: string, lat: number | null, lon: number | null) => ({
  visit: {
    id,
    checkInAt: new Date(at),
    checkInLatitude: lat,
    checkInLongitude: lon,
    locationClearedAt: null,
  },
  taskTitle: `Task ${id}`,
  serviceLabel: null,
  projectCode: 'P-1',
});
const place = {
  id: 'o',
  name: 'Office',
  latitude: 18.52,
  longitude: 73.85,
  radiusM: 100,
  active: true,
  createdAt: new Date(),
};
const policy = (rate: number) => ({ policy: { travel: { ratePaisePerKm: rate } } });

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
    const { db, writes } = fakeDb([[dayRow()], [], [place], [], [policy(900)]]);
    await takeTravelSnapshot(db, 'u1', '2026-11-15');
    expect(writes[0]?.values?.source).toBe('close');
  });

  it('keeps the rate a day was first saved with when it is measured again', async () => {
    const { db, writes } = fakeDb([
      [dayRow()],
      [visit('a', '2026-11-15T06:00:00Z', 18.56, 73.9)],
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
      [saved],
    ]);
    expect(await takeTravelSnapshot(db, 'u1', '2026-11-15')).toBe(saved);
    expect(writes).toHaveLength(0);
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
