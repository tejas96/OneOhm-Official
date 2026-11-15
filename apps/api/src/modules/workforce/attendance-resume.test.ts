import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '../../common/auth/actor';

const lib = vi.hoisted(() => ({ dropTravelSnapshot: vi.fn() }));
vi.mock('../../common/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('@oneohm/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@oneohm/database')>()),
  ...lib,
}));
vi.mock('@oneohm/domain', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@oneohm/domain')>()),
  canResumeDay: () => true,
}));

import { resumeDuty } from './attendance-resume';

const link = (rows: unknown[]): unknown =>
  new Proxy(
    {},
    {
      get: (_, key) =>
        key === 'then' ? (ok: (v: unknown[]) => void) => ok(rows) : () => link(rows),
    },
  );

describe('resume duty (S3, S4)', () => {
  beforeEach(() => vi.clearAllMocks());

  /** The transaction reads the day first, then any pending or approved travel claim. */
  const run = (claim: unknown[]) => {
    const reads = [[{ id: 'd1', workDate: '2026-11-15', checkOutAt: new Date() }], claim];
    const updates: unknown[] = [];
    const tx = {
      select: () => link(reads.shift() ?? []),
      update: () => ({
        set: (set: unknown) => {
          updates.push(set);
          return { where: async () => undefined };
        },
      }),
    };
    const db = { transaction: async (work: (handle: typeof tx) => unknown) => work(tx) };
    return { tx, updates, result: resumeDuty(db as never, { userId: 'u1' } as unknown as Actor) };
  };

  it('forgets the saved travel of the day, which is open again and is saved at the next End duty', async () => {
    const { tx, result } = run([]);
    await result;
    expect(lib.dropTravelSnapshot).toHaveBeenCalledWith(tx, 'u1', '2026-11-15');
  });

  it('refuses with 409 claim_exists when a pending or approved claim is on the day', async () => {
    const { updates, result } = run([{ id: 'c1' }]);
    await expect(result).rejects.toMatchObject({ status: 409, code: 'claim_exists' });
    expect(updates).toHaveLength(0);
    expect(lib.dropTravelSnapshot).not.toHaveBeenCalled();
  });

  it('counts today in the business time zone', async () => {
    const text = await readFile(join(__dirname, 'attendance-resume.ts'), 'utf8');
    expect(text).toMatch(/todayIn\(businessTimeZone\(\)\)/);
  });
});

describe('an approved correction (S3, S4)', () => {
  it('measures the corrected day again, after it is written and inside the same transaction', async () => {
    const text = await readFile(join(__dirname, 'corrections.service.ts'), 'utf8');
    const apply = text.indexOf('await applyCorrection(tx, row);');
    const take = text.indexOf('await takeTravelSnapshot(tx, row.userId, row.workDate);');
    expect(apply).toBeGreaterThan(0);
    expect(take).toBeGreaterThan(apply);
  });
});
