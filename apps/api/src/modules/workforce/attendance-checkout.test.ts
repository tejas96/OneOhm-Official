import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '../../common/auth/actor';

const db = vi.hoisted(() => ({
  closeVisitsAtDayEnd: vi.fn(async () => ['v1']),
  takeTravelSnapshot: vi.fn(async () => null),
}));
const conditions = vi.hoisted(() => ({ saveConditions: vi.fn() }));

vi.mock('./device-conditions', () => conditions);
vi.mock('./tracking', () => ({
  readingOutcome: vi.fn(async () => ({ reading: null, skipped: 'no_reading' })),
  consentSummary: vi.fn(),
}));
vi.mock('./policy', () => ({ activeLocations: vi.fn(async () => []), loadPolicy: vi.fn() }));
vi.mock('@oneohm/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@oneohm/database')>()),
  ...db,
}));

import { AttendanceService } from './attendance.service';

const actor = { userId: 'u1', fullName: 'Ravi', capabilities: new Set() } as unknown as Actor;

function harness(openDay: unknown[], updated: unknown[]) {
  const link = (rows: unknown[]): unknown =>
    new Proxy(
      {},
      {
        get: (_, key) =>
          key === 'then' ? (ok: (v: unknown[]) => void) => ok(rows) : () => link(rows),
      },
    );
  const tx = { update: vi.fn(() => link(updated)) };
  const transaction = vi.fn(async (work: (handle: typeof tx) => unknown) => work(tx));
  return { tx, transaction, db: { select: vi.fn(() => link(openDay)), transaction } };
}

beforeEach(() => vi.clearAllMocks());

describe('End duty (S1, S3, S4)', () => {
  it('closes the open site visits and saves the day’s travel in the same transaction', async () => {
    const h = harness(
      [{ id: 'd1', workDate: '2026-11-15', checkInAt: new Date('2026-11-15T04:00:00Z') }],
      [{ id: 'd1' }],
    );
    await new AttendanceService(h.db as never).checkOut(actor, null);
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(db.closeVisitsAtDayEnd).toHaveBeenCalledWith(h.tx, 'u1', expect.any(Date));
    expect(db.takeTravelSnapshot).toHaveBeenCalledWith(h.tx, 'u1', '2026-11-15');
    // Visits first, then the snapshot: the count and the legs are read after they closed.
    expect(db.closeVisitsAtDayEnd.mock.invocationCallOrder[0]).toBeLessThan(
      db.takeTravelSnapshot.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('does neither when there is no open day', async () => {
    const h = harness([], []);
    await expect(new AttendanceService(h.db as never).checkOut(actor, null)).rejects.toMatchObject({
      status: 409,
      code: 'not_checked_in',
    });
    expect(db.closeVisitsAtDayEnd).not.toHaveBeenCalled();
    expect(db.takeTravelSnapshot).not.toHaveBeenCalled();
  });

  it('does neither when the day was ended by someone else a moment earlier', async () => {
    const h = harness(
      [{ id: 'd1', workDate: '2026-11-15', checkInAt: new Date('2026-11-15T04:00:00Z') }],
      [],
    );
    await expect(new AttendanceService(h.db as never).checkOut(actor, null)).rejects.toMatchObject({
      code: 'not_checked_in',
    });
    expect(db.takeTravelSnapshot).not.toHaveBeenCalled();
  });
});
