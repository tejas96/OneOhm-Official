import { describe, expect, it } from 'vitest';
import { idleDays, isStale, onLeave } from './staleness';

const today = '2026-11-02';
const base = { status: 'ready', lastUpdate: '2026-10-28', today, leave: [], thresholdDays: 3 };

describe('idleDays', () => {
  it('counts whole days since the last update', () => {
    expect(idleDays('2026-10-28', today, [])).toBe(5);
  });

  it('does not count days on leave', () => {
    expect(idleDays('2026-10-28', today, [{ from: '2026-10-29', to: '2026-10-31' }])).toBe(2);
  });

  it('counts overlapping leave days once', () => {
    expect(
      idleDays('2026-10-28', today, [
        { from: '2026-10-29', to: '2026-10-30' },
        { from: '2026-10-30', to: '2026-10-31' },
      ]),
    ).toBe(2);
  });
});

describe('isStale', () => {
  it('only ready and in-progress tasks can be stale', () => {
    const old = { ...base, lastUpdate: '2026-10-20' };
    expect(isStale({ ...old, status: 'waiting' })).toBe(false);
    expect(isStale({ ...old, status: 'pending' })).toBe(false);
    expect(isStale({ ...old, status: 'in_progress' })).toBe(true);
  });

  it('is stale at the threshold, not before', () => {
    expect(isStale({ ...base, lastUpdate: '2026-10-30' })).toBe(true);
    expect(isStale({ ...base, lastUpdate: '2026-10-31' })).toBe(false);
  });
});

describe('onLeave', () => {
  it('knows when someone is on leave today', () => {
    expect(onLeave(today, [{ from: '2026-11-01', to: '2026-11-03' }])).toBe(true);
    expect(onLeave(today, [{ from: '2026-10-01', to: '2026-10-03' }])).toBe(false);
  });
});
