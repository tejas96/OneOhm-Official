import type { AttendanceDay } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { dayStateOf } from './day-state';

const day = (over: Partial<AttendanceDay> = {}): AttendanceDay => ({
  workDate: '2026-11-15',
  checkInAt: '2026-11-15T04:00:00.000Z',
  checkOutAt: null,
  late: false,
  place: null,
  checkOutInside: null,
  corrected: false,
  ...over,
});
const today = '2026-11-15';

describe('what the card offers', () => {
  it('offers Check in with no day', () => {
    expect(dayStateOf(null, today, null)).toEqual({ kind: 'in' });
  });
  it('offers Check out for an open day, and says when it is from before', () => {
    expect(dayStateOf(day(), today, null)).toEqual({ kind: 'out', fromEarlier: false });
    expect(dayStateOf(day({ workDate: '2026-11-14' }), today, null)).toEqual({
      kind: 'out',
      fromEarlier: true,
    });
  });
  it('lets a person resume only their own check-out today', () => {
    const out = { checkOutAt: '2026-11-15T12:00:00.000Z' };
    expect(dayStateOf(day(out), today, null)).toMatchObject({ kind: 'done', canResume: true });
    expect(dayStateOf(day({ ...out, autoClosed: true }), today, null)).toMatchObject({
      canResume: false,
      autoClosed: true,
    });
    expect(dayStateOf(day({ ...out, corrected: true }), today, null)).toMatchObject({
      canResume: false,
    });
  });
  it('counts a tap waiting for signal as made', () => {
    expect(dayStateOf(null, today, 'in')).toEqual({ kind: 'out', fromEarlier: false });
    expect(dayStateOf(day(), today, 'out')).toEqual({ kind: 'sending' });
  });
});
