import { describe, expect, it } from 'vitest';
import { visitsToRefresh } from './duty-point-alerts';

const T0 = new Date('2026-11-16T04:00:00Z');
const min = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const visit = (id: string, from: number, to: number | null) =>
  ({ row: { id, checkInAt: min(from), checkOutAt: to === null ? null : min(to) } }) as never;
const point = (minute: number) => ({ attendanceDayId: 'd1', recordedAt: min(minute) });

describe('visitsToRefresh', () => {
  const facts = {
    visits: [visit('morning', 0, 30), visit('noon', 120, 150), visit('open', 200, null)],
  };

  it('refreshes only closed visits overlapping the new points', () => {
    expect(visitsToRefresh(facts, [point(10), point(20)])).toEqual(['morning']);
    expect(visitsToRefresh(facts, [point(25), point(130)])).toEqual(['morning', 'noon']);
    expect(visitsToRefresh(facts, [point(60), point(90)])).toEqual([]);
    expect(visitsToRefresh(facts, [point(210)])).toEqual([]);
    expect(visitsToRefresh(facts, [])).toEqual([]);
  });
});
