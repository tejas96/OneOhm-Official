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
  checkInInside: true,
  checkOutInside: true,
};

export const policyWith = (travel: Partial<WorkforcePolicy['travel']> = {}): WorkforcePolicy => ({
  ...DEFAULT_WORKFORCE_POLICY,
  travel: { ...DEFAULT_WORKFORCE_POLICY.travel, ...travel },
});

export /** Reads in order: the day's claims, then visits, the attendance day, leave, and (flagged) the worker. */
const settle = (
  claims: unknown[],
  extra: { visits?: unknown[]; day?: unknown; leave?: unknown[] } = {},
  snapshot = snap(),
  policy = policyWith({ autoApprove: true }),
) => {
  const kit = scriptedTx(
    [
      claims,
      extra.visits ?? cleanVisits,
      [extra.day ?? plainDay],
      extra.leave ?? [],
      [{ name: 'Ravi' }],
    ],
    { travel_claims: [[{ id: 'c1', userId: 'worker', workDate: '2026-11-14' }]] },
  );
  return { ...kit, result: settleDayClaim(kit.tx, snapshot, policy) };
};
