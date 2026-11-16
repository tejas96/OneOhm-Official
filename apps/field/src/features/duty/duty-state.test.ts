import type { AttendanceDay } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import {
  needsBatteryHint,
  routeLineOf,
  shouldRecord,
  shouldStopBackground,
  staleDutyFiles,
} from './duty-state';

const day = (checkOutAt: string | null) => ({ checkOutAt }) as AttendanceDay;
const base = { day: null, queued: null, consentGiven: true, captureLocation: true } as const;

describe('when the route records', () => {
  it('records while the day is open and stops once it is closed', () => {
    expect(shouldRecord({ ...base, day: day(null) })).toBe(true);
    expect(shouldRecord({ ...base, day: day('2026-11-16T12:00:00Z') })).toBe(false);
    expect(shouldRecord(base)).toBe(false);
  });

  it('counts a check-in waiting for signal as started and a waiting check-out as ended', () => {
    expect(shouldRecord({ ...base, queued: 'in' })).toBe(true);
    expect(shouldRecord({ ...base, day: day(null), queued: 'out' })).toBe(false);
  });

  it('needs consent to the current words and location on for the person', () => {
    expect(shouldRecord({ ...base, day: day(null), consentGiven: false })).toBe(false);
    expect(shouldRecord({ ...base, day: day(null), captureLocation: false })).toBe(false);
  });
});

describe('the status line', () => {
  const on = { recording: true, mode: 'on', waiting: 0, stalled: false } as const;
  it('says nothing when not on duty', () => {
    expect(routeLineOf({ ...on, recording: false })).toBeNull();
  });
  it('says how it records', () => {
    expect(routeLineOf(on)).toEqual({ kind: 'on' });
    expect(routeLineOf({ ...on, mode: 'foreground' })).toEqual({ kind: 'foreground' });
  });
  it('asks to fix a missing permission before anything else', () => {
    expect(routeLineOf({ ...on, mode: 'no_permission', waiting: 4, stalled: true })).toEqual({
      kind: 'fix',
    });
  });
  it('counts the points waiting only when the upload is stuck', () => {
    expect(routeLineOf({ ...on, waiting: 12 })).toEqual({ kind: 'on' });
    expect(routeLineOf({ ...on, waiting: 12, stalled: true })).toEqual({
      kind: 'waiting',
      count: 12,
    });
  });
});

describe('the battery-saver hint', () => {
  it('is for Android phones of the makers that close background apps', () => {
    for (const maker of ['Xiaomi', 'OPPO', 'vivo', 'realme', 'OnePlus', 'Redmi'])
      expect(needsBatteryHint('android', maker)).toBe(true);
    expect(needsBatteryHint('android', 'samsung')).toBe(false);
    expect(needsBatteryHint('ios', 'Xiaomi')).toBe(false);
    expect(needsBatteryHint('android', null)).toBe(false);
  });
});

describe('when the background task stops itself', () => {
  const result = (over: Partial<Parameters<typeof shouldStopBackground>[0] & object> = {}) => ({
    reasons: [] as never[],
    unauthorized: false,
    ...over,
  });

  it('stops on a 401, with the app open or closed', () => {
    expect(shouldStopBackground(result({ unauthorized: true }), true)).toBe(true);
    expect(shouldStopBackground(result({ unauthorized: true }), false)).toBe(true);
  });

  it('stops for a closed day or no consent only with the app closed', () => {
    const closedDay = result({ reasons: ['no_open_day'] });
    expect(shouldStopBackground(closedDay, false)).toBe(true);
    expect(shouldStopBackground(closedDay, true)).toBe(false);
    expect(shouldStopBackground(result({ reasons: ['outside_duty'] }), false)).toBe(false);
  });

  it('does nothing with no upload result', () => {
    expect(shouldStopBackground(null, false)).toBe(false);
  });
});

describe('old saved files', () => {
  const now = Date.UTC(2026, 10, 30);
  const days = (count: number) => now - count * 86_400_000;
  it('deletes a points file older than 14 days and keeps newer ones and other files', () => {
    expect(
      staleDutyFiles(
        [
          { name: 'points-a.json', modifiedAt: days(15) },
          { name: 'points-b.json', modifiedAt: days(13) },
          { name: 'prefs.json', modifiedAt: days(40) },
          { name: 'points-c.json', modifiedAt: null },
        ],
        now,
      ),
    ).toEqual(['points-a.json']);
  });
});
