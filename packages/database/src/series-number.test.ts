import { describe, expect, it } from 'vitest';
import type { DatabaseExecutor } from './client';
import { quotations } from './schema';
import { nextInSeries, seriesNumber } from './series-number';

/** A db whose highest number in the series is `last` (null: none yet). */
function fakeDb(last: number | null) {
  const calls: unknown[] = [];
  const db = {
    execute: async (query: unknown) => {
      calls.push(query);
      return { rows: calls.length === 1 ? [] : [{ last }] };
    },
  };
  return { db: db as unknown as DatabaseExecutor, calls };
}

const options = {
  column: quotations.number,
  prefix: 'OH-Q-2026-',
  width: 4,
  lockKey: 'quotation',
};

describe('nextInSeries', () => {
  it('starts at 1 when the series is empty', async () => {
    expect(await nextInSeries(fakeDb(null).db, options)).toBe('OH-Q-2026-0001');
  });

  it('follows the highest number, not the count (a deleted row leaves a gap)', async () => {
    // Rows 0001…0017 with 0016 deleted: the count is 16, the next number must be 0018.
    expect(await nextInSeries(fakeDb(17).db, options)).toBe('OH-Q-2026-0018');
  });

  it('takes the lock before it reads', async () => {
    const fake = fakeDb(3);
    await nextInSeries(fake.db, options);
    expect(fake.calls).toHaveLength(2);
  });
});

describe('seriesNumber', () => {
  it('pads to the width and grows past it', () => {
    expect(seriesNumber('OH-2026-', 13, 3)).toBe('OH-2026-014');
    expect(seriesNumber('WO-2026-', 9999, 4)).toBe('WO-2026-10000');
  });
});
