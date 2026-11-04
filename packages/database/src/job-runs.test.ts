import { describe, expect, it } from 'vitest';
import type { DatabaseExecutor } from './client';
import { clearOldJobRuns, noteBackgroundRun, STALE_RETRY_ERROR } from './job-runs';

/** Just enough of drizzle for noteBackgroundRun: the last run's status, and inserts. */
function fakeDb(lastStatus: string | null) {
  const inserted: Record<string, unknown>[] = [];
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => (lastStatus ? [{ status: lastStatus }] : []),
  };
  const db = {
    select: () => chain,
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        inserted.push(values);
      },
    }),
  };
  return { db: db as unknown as DatabaseExecutor, inserted };
}

describe('background runs', () => {
  it('records a quiet success when the last run of that job had failed', async () => {
    const { db, inserted } = fakeDb('failed');
    await noteBackgroundRun(db, 'incentive_sweep', { count: 0 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ name: 'incentive_sweep', status: 'succeeded' });
  });

  it('keeps quiet when nothing happened and the last run was fine', async () => {
    for (const last of ['succeeded', null]) {
      const { db, inserted } = fakeDb(last);
      await noteBackgroundRun(db, 'incentive_sweep', { count: 0 });
      expect(inserted).toHaveLength(0);
    }
  });

  it('still records work done and failures', async () => {
    const done = fakeDb(null);
    await noteBackgroundRun(done.db, 'payout_sync', { count: 2 });
    expect(done.inserted[0]).toMatchObject({ status: 'succeeded', result: '2' });
    const failed = fakeDb(null);
    await noteBackgroundRun(failed.db, 'payout_sync', { error: new Error('down') });
    expect(failed.inserted[0]).toMatchObject({ status: 'failed', error: 'down' });
  });
});

describe('clearing old runs', () => {
  it('gives up on a retry nobody picked up', async () => {
    const updates: Record<string, unknown>[] = [];
    const db = {
      delete: () => ({ where: () => ({ returning: async () => [] }) }),
      update: () => ({
        set: (values: Record<string, unknown>) => {
          updates.push(values);
          return { where: async () => undefined };
        },
      }),
    } as unknown as DatabaseExecutor;
    await clearOldJobRuns(db, new Date('2026-11-04T10:00:00Z'));
    expect(updates.map((values) => values.error)).toContain(STALE_RETRY_ERROR);
  });
});
