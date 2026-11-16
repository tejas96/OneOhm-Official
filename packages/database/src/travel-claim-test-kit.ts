import { DEFAULT_WORKFORCE_POLICY, type WorkforcePolicy } from '@oneohm/domain';
import { getTableName } from 'drizzle-orm';
import { settleDayClaim } from './travel-auto-claim';

/**
 * A transaction double for the travel claim steps: each `select()` takes the next queued
 * result, each insert returns its table's next queued result (default one row `{ id: 'new' }`),
 * and every insert and update is recorded with its table.
 */
export function scriptedTx(selects: unknown[][], returning: Record<string, unknown[][]> = {}) {
  const inserts: { table: unknown; values: Record<string, unknown> }[] = [];
  const updates: { table: unknown; set: Record<string, unknown> }[] = [];
  const link = (rows: unknown[]): unknown =>
    new Proxy(
      {},
      {
        get: (_, key) =>
          key === 'then' ? (ok: (value: unknown[]) => void) => ok(rows) : () => link(rows),
      },
    );
  const tx = {
    select: () => link(selects.shift() ?? []),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        const queue = returning[getTableName(table as never)];
        return link(queue?.shift() ?? [{ id: 'new', ...values }]);
      },
    }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => {
        updates.push({ table, set });
        return link([{ id: 'updated' }]);
      },
    }),
    transaction: async <T>(run: (inner: unknown) => Promise<T>) => run(tx),
  };
  return { tx: tx as never, inserts, updates };
}

/** A saved travel day (`travel_days` row) for 14 Nov: 18.4 km paid on a clean route. */
export const snap = (over: Record<string, unknown> = {}) =>
  ({
    userId: 'worker',
    workDate: '2026-11-14',
    distanceM: 18_400,
    paidM: 18_400,
    routeM: 18_400,
    straightM: 14_200,
    method: 'route',
    capApplied: false,
    commuteDeductM: 0,
    gapCount: 0,
    gapMinutes: 0,
    mockedCount: 0,
    pointsCount: 40,
    ratePaisePerKm: 500,
    legs: [{ fromLabel: 'Office', toLabel: 'P-1', distanceM: 9000 }],
    visits: 2,
    ...over,
  }) as never;

export const at = (hour: number) => new Date(Date.UTC(2026, 10, 14, hour));
export const cleanVisits = [
  { projectId: 'p1', checkInAt: at(5), far: false, latitude: 16.8, cleared: null },
  { projectId: 'p2', checkInAt: at(7), far: false, latitude: 16.9, cleared: null },
];
export const plainDay = {
  autoClosedAt: null,
  tapDelayed: false,
};

/** The reads of a duty start and end when the day has no position at all: nothing to judge. */
export const noStart: unknown[][] = [[], []];

type Spot = { latitude: number; longitude: number };

/**
 * The reads of the duty start and end (`dutyPlaces`), in order: the attendance day, the visits,
 * the route, the offices (for the end label), the saved base and the offices again.
 * Both ends have a position (the end defaults to the start); the offices are none by default.
 */
export const startAt = (
  checkIn: Spot,
  base: Spot | null,
  offices: unknown[] = [],
  checkOut: Spot | null = checkIn,
): unknown[][] => [
  [
    {
      day: {
        id: 'day1',
        checkInAt: new Date(Date.UTC(2026, 10, 14, 4)),
        checkInLatitude: checkIn.latitude,
        checkInLongitude: checkIn.longitude,
        checkOutAt: new Date(Date.UTC(2026, 10, 14, 12)),
        checkOutLatitude: checkOut?.latitude ?? null,
        checkOutLongitude: checkOut?.longitude ?? null,
        locationClearedAt: null,
      },
      place: null,
    },
  ],
  [],
  [],
  ...(checkOut ? [offices] : []),
  base ? [base] : [],
  offices,
];

/** The default day for the scripted claim tests: starts and ends at home, which is the saved base. */
const HOME = { latitude: 16.85, longitude: 74.58 };
export const homeDay: unknown[][] = startAt(HOME, HOME);

export const policyWith = (travel: Partial<WorkforcePolicy['travel']> = {}): WorkforcePolicy => ({
  ...DEFAULT_WORKFORCE_POLICY,
  travel: { ...DEFAULT_WORKFORCE_POLICY.travel, ...travel },
});

export /** Reads in order: the day's claims, then visits, the attendance day, leave, the duty start, and (flagged) the worker. */
const settle = (
  claims: unknown[],
  extra: { visits?: unknown[]; day?: unknown; leave?: unknown[]; start?: unknown[][] } = {},
  snapshot = snap(),
  policy = policyWith({ autoApprove: true }),
) => {
  const kit = scriptedTx(
    [
      claims,
      extra.visits ?? cleanVisits,
      [extra.day ?? plainDay],
      extra.leave ?? [],
      ...(extra.start ?? homeDay),
      [{ name: 'Ravi' }],
    ],
    { travel_claims: [[{ id: 'c1', userId: 'worker', workDate: '2026-11-14' }]] },
  );
  return { ...kit, result: settleDayClaim(kit.tx, snapshot, policy) };
};
