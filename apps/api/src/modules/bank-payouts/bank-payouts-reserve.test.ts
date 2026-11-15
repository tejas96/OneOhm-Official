import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bankPayouts } from '@oneohm/database';
import { describe, expect, it } from 'vitest';
import type { Actor } from '../../common/auth/actor';
import { reservePayout } from './payout-reserve';

const link = (rows: unknown[], log?: string[]): unknown =>
  new Proxy(
    {},
    {
      get: (_, key) =>
        key === 'then'
          ? (ok: (v: unknown[]) => void) => ok(rows)
          : () => {
              if (typeof key === 'string') log?.push(key);
              return link(rows, log);
            },
    },
  );

const bill = (patch: object = {}) => ({
  id: 'b1',
  status: 'approved',
  amountPaise: 10_000,
  tdsPaise: 0,
  advanceAdjustedPaise: 0,
  paidPaise: 0,
  ...patch,
});

/** The transaction reads the bill (locked), then any open transfer, then inserts the row. */
function reserve(rows: { bill?: object | null; open?: boolean }, send = 10_000) {
  const log: string[] = [];
  const inserted: unknown[] = [];
  const reads = [rows.bill === null ? [] : [rows.bill ?? bill()], rows.open ? [{ id: 'p0' }] : []];
  const tx = {
    select: () => link(reads.shift() ?? [], log),
    insert: (table: unknown) => ({
      values: (value: unknown) => {
        inserted.push({ table, value });
        return link([{ id: 'payout-1', ...(value as object) }]);
      },
    }),
  };
  const db = { transaction: async (work: (handle: typeof tx) => unknown) => work(tx) };
  return {
    log,
    inserted,
    result: reservePayout(db as never, 'razorpayx', { userId: 'fin' } as Actor, 'b1', send, {
      fundAccountId: 'fa1',
      mode: 'IMPS',
      accountMasked: 'XXXX1234',
      requestId: null,
      askedBy: null,
    }),
  };
}

describe('saving the payout row before money moves', () => {
  it('locks the bill and saves a queued row for it', async () => {
    const { log, inserted, result } = reserve({});
    await result;
    expect(log).toContain('for');
    expect(inserted[0]).toMatchObject({
      table: bankPayouts,
      value: { payableId: 'b1', amountPaise: 10_000 },
    });
    // Left to the database default: 'queued', the state the check settles by reference.
    expect((inserted[0] as { value: { status?: string } }).value.status).toBeUndefined();
  });

  it('refuses a bill that is no longer approved (a void got there first)', async () => {
    const { inserted, result } = reserve({ bill: bill({ status: 'cancelled' }) });
    await expect(result).rejects.toMatchObject({ status: 409, code: 'not_approved' });
    expect(inserted).toHaveLength(0);
  });

  it('refuses when a transfer is already open', async () => {
    const { inserted, result } = reserve({ open: true });
    await expect(result).rejects.toMatchObject({ status: 409, code: 'already_sending' });
    expect(inserted).toHaveLength(0);
  });

  it('refuses more than is left on the bill as read under the lock', async () => {
    const { inserted, result } = reserve({ bill: bill({ paidPaise: 9_000 }) }, 5_000);
    await expect(result).rejects.toMatchObject({ status: 400 });
    expect(inserted).toHaveLength(0);
  });

  it('answers 404 for a bill that is not there', async () => {
    await expect(reserve({ bill: null }).result).rejects.toMatchObject({ status: 404 });
  });

  it('saves the row before RazorpayX is called, and marks it failed when rejected', () => {
    const text = readFileSync(join(__dirname, 'bank-payouts.service.ts'), 'utf8');
    expect(text.indexOf('await reservePayout(')).toBeLessThan(
      text.indexOf('this.gateway.createPayout('),
    );
    expect(text).toMatch(/set\(\{ status: 'failed'/);
  });
});
