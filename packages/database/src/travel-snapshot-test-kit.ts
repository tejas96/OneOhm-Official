/** A drizzle-like handle: each `select()` takes the next queued result; writes are recorded. */
export function fakeDb(queue: unknown[][], options: { failSettle?: boolean } = {}) {
  const writes: { values?: Record<string, unknown> }[] = [];
  const audits: Record<string, unknown>[] = [];
  let calls = 0;
  const link = (rows: unknown[]): unknown =>
    new Proxy(
      {},
      {
        get: (_, key) =>
          key === 'then' ? (ok: (value: unknown[]) => void) => ok(rows) : () => link(rows),
      },
    );
  const settled: unknown[] = [];
  const db = {
    transaction: async (run: (inner: unknown) => unknown) => {
      calls += 1;
      // The first transaction is the claim step; a second one reports a fault in it.
      if (options.failSettle && calls === 1) throw new Error('claim step broke');
      settled.push(
        await run({
          select: () => link([]),
          insert: () => ({
            values: (values: Record<string, unknown>) => {
              audits.push(values);
              return link([]);
            },
          }),
        }),
      );
    },
    select: () => link(queue.shift() ?? []),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        const write: { values?: Record<string, unknown> } = { values };
        writes.push(write);
        return { onConflictDoUpdate: () => link([{ ...values, id: 'row' }]) };
      },
    }),
  };
  return { db: db as never, writes, settled, audits };
}

export const OFFICE = { latitude: 18.52, longitude: 73.85 };
export const dayRow = (patch: Record<string, unknown> = {}) => ({
  day: {
    id: 'day-1',
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
export const visit = (id: string, at: string, lat: number | null, lon: number | null) => ({
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
export const place = {
  id: 'o',
  name: 'Office',
  latitude: 18.52,
  longitude: 73.85,
  radiusM: 100,
  active: true,
  createdAt: new Date(),
};
export const policy = (rate: number) => ({ policy: { travel: { ratePaisePerKm: rate } } });
