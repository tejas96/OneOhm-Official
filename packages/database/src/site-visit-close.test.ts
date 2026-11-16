import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { closeVisitsAtDayEnd } from './site-visit-close';

function fakeDb(open: { id: string; checkInAt: Date }[]) {
  const sets: Record<string, unknown>[] = [];
  const link = (rows: unknown[]): unknown =>
    new Proxy(
      {},
      {
        get: (_, key) =>
          key === 'then' ? (ok: (v: unknown[]) => void) => ok(rows) : () => link(rows),
      },
    );
  return {
    sets,
    db: {
      select: () => link(open),
      update: () => ({
        set: (value: Record<string, unknown>) => {
          sets.push(value);
          return link([{ id: 'closed' }]);
        },
      }),
    } as never,
  };
}

describe('closeVisitsAtDayEnd (S1)', () => {
  it('closes each open visit at the day end, marked as ended with the day', async () => {
    const at = new Date('2026-11-15T12:00:00Z');
    const { db, sets } = fakeDb([{ id: 'a', checkInAt: new Date('2026-11-15T05:00:00Z') }]);
    expect(await closeVisitsAtDayEnd(db, 'u1', at)).toEqual(['closed']);
    expect(sets[0]).toMatchObject({
      checkOutAt: at,
      closeKind: 'day_end',
      checkOutSource: 'day_end',
    });
  });

  it('never closes a visit before it began', async () => {
    const checkInAt = new Date('2026-11-15T13:00:00Z');
    const { db, sets } = fakeDb([{ id: 'a', checkInAt }]);
    await closeVisitsAtDayEnd(db, 'u1', new Date('2026-11-15T12:00:00Z'));
    expect(sets[0]?.checkOutAt).toEqual(checkInAt);
  });

  it('does nothing when none is open', async () => {
    const { db, sets } = fakeDb([]);
    expect(await closeVisitsAtDayEnd(db, 'u1', new Date())).toEqual([]);
    expect(sets).toHaveLength(0);
  });
});

/** The night job and the retention sweep call these in the right order. */
describe('the day-close job and the retention sweep', () => {
  const source = (name: string) => readFile(join(__dirname, name), 'utf8');

  it('closes visits, then saves travel, when the night job ends a forgotten day', async () => {
    const text = await source('attendance-close.ts');
    expect(text.indexOf('closeVisitsAtDayEnd(tx')).toBeGreaterThan(0);
    expect(text.indexOf('closeVisitsAtDayEnd(tx')).toBeLessThan(
      text.indexOf('takeTravelSnapshot(tx'),
    );
    expect(text.indexOf('takeTravelSnapshot(tx')).toBeLessThan(text.indexOf('autoClosedNotice('));
  });

  it('does each day in one transaction, with the notices inside it and none for old days', async () => {
    const text = await source('attendance-close.ts');
    expect(text).toMatch(/db\.transaction\(async \(tx\)/);
    expect(text).toMatch(/lt\(attendanceDays\.workDate, today\)/);
    expect(text).toMatch(/AUTO_CLOSE_NOTICE_DAYS = 7/);
    expect(text.indexOf('if (announce) {')).toBeGreaterThan(text.indexOf('takeTravelSnapshot(tx'));
    expect(text.indexOf('autoClosedNotice(')).toBeGreaterThan(text.indexOf('if (announce) {'));
    expect(text).toMatch(/closeStaleVisits\(db/);
  });

  it('closes a stale visit at its own day end, then saves that day again', async () => {
    const text = await source('site-visit-close.ts');
    expect(text).toMatch(/addDays\(visit\.workDate, 1\)/);
    expect(text.lastIndexOf('takeTravelSnapshot(tx')).toBeGreaterThan(
      text.indexOf('closeStaleVisits'),
    );
  });

  it('saves travel for closed days with none before it clears any coordinates', async () => {
    const text = await source('location-retention.ts');
    expect(text.indexOf('await saveUnsavedTravel(')).toBeGreaterThan(0);
    expect(text.indexOf('await saveUnsavedTravel(')).toBeLessThan(
      text.indexOf('.update(attendanceDays)'),
    );
    expect(text).toMatch(/isNotNull\(attendanceDays\.checkOutAt\)/);
    expect(text).not.toMatch(/'Asia\/Kolkata'/);
  });
});
