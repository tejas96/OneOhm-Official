import { describe, expect, it } from 'vitest';
import {
  type DutyWindowDay,
  judgeDutyPoint,
  summariseDutyRoute,
  validCoordinates,
} from './duty-points';

const now = new Date('2026-11-16T10:00:00Z');
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
const open = { id: 'day-1', workDate: '2026-11-16', checkInAt: at(-120), checkOutAt: null };
const closed = { id: 'day-2', workDate: '2026-11-16', checkInAt: at(-300), checkOutAt: at(-60) };

const judge = (over: Partial<Parameters<typeof judgeDutyPoint>[0]> = {}) =>
  judgeDutyPoint({
    recordedAt: at(-10),
    latitude: 16.85,
    longitude: 74.58,
    now,
    switchedOn: true,
    consentGiven: true,
    days: [open],
    duplicate: false,
    ...over,
  });

describe('which route points are kept', () => {
  it('keeps a point inside an open day, for that day', () => {
    expect(judge()).toEqual({ accepted: true, dayId: 'day-1' });
  });

  it('is not limited by working hours: a night point on an open day is kept', () => {
    const night = new Date('2026-11-16T22:30:00Z');
    expect(
      judge({
        recordedAt: night,
        now: new Date('2026-11-16T22:31:00Z'),
        days: [
          {
            id: 'd',
            workDate: '2026-11-16',
            checkInAt: new Date('2026-11-16T20:00:00Z'),
            checkOutAt: null,
          },
        ],
      }),
    ).toEqual({ accepted: true, dayId: 'd' });
  });

  it('needs the policy on and consent to the current words, policy first', () => {
    expect(judge({ switchedOn: false, consentGiven: false })).toEqual({
      accepted: false,
      reason: 'policy_off',
    });
    expect(judge({ consentGiven: false })).toEqual({ accepted: false, reason: 'no_consent' });
  });

  it('refuses coordinates that cannot be a real fix', () => {
    for (const [latitude, longitude] of [
      [91, 10],
      [10, -181],
      [0, 0],
      [Number.NaN, 10],
    ])
      expect(judge({ latitude: latitude ?? 0, longitude: longitude ?? 0 })).toEqual({
        accepted: false,
        reason: 'bad_coordinates',
      });
    expect(validCoordinates(0, 74.5)).toBe(true);
  });

  it('refuses a point more than 2 minutes ahead, and keeps one within the skew', () => {
    expect(judge({ recordedAt: at(3) })).toEqual({ accepted: false, reason: 'in_future' });
    expect(judge({ recordedAt: at(1) })).toEqual({ accepted: true, dayId: 'day-1' });
  });

  it('refuses a point before check-in and says so when there is no day at all', () => {
    expect(judge({ recordedAt: at(-121) })).toEqual({ accepted: false, reason: 'outside_duty' });
    expect(judge({ days: [] })).toEqual({ accepted: false, reason: 'no_open_day' });
  });

  it('allows 5 minutes after a check-out for a late flush, not 6', () => {
    expect(judge({ days: [closed], recordedAt: at(-60 + 5) })).toEqual({
      accepted: true,
      dayId: 'day-2',
    });
    expect(judge({ days: [closed], recordedAt: at(-60 + 6) })).toEqual({
      accepted: false,
      reason: 'outside_duty',
    });
  });

  it('picks the day the point falls in when two are near', () => {
    expect(judge({ days: [closed, open], recordedAt: at(-200) })).toEqual({
      accepted: true,
      dayId: 'day-2',
    });
  });

  it('counts a duplicate as accepted before any other rule', () => {
    expect(judge({ duplicate: true, consentGiven: false, days: [] })).toEqual({
      accepted: true,
      dayId: null,
    });
  });
});

describe('which day a point belongs to', () => {
  // Monday forgotten open, Tuesday checked in the next morning (IST: 09:30 = 04:00Z).
  const monday: DutyWindowDay = {
    id: 'mon',
    workDate: '2026-11-16',
    checkInAt: new Date('2026-11-16T04:00:00Z'),
    checkOutAt: null,
  };
  const tuesday: DutyWindowDay = {
    id: 'tue',
    workDate: '2026-11-17',
    checkInAt: new Date('2026-11-17T04:00:00Z'),
    checkOutAt: null,
  };
  const tuesdayNoon = new Date('2026-11-17T08:00:00Z');
  const on = (recordedAt: string, days = [monday, tuesday], nowAt = tuesdayNoon) =>
    judge({ recordedAt: new Date(recordedAt), days, now: nowAt });

  it('gives a point to the day with the latest check-in before it', () => {
    expect(on('2026-11-17T05:00:00Z')).toEqual({ accepted: true, dayId: 'tue' });
    expect(on('2026-11-16T10:00:00Z')).toEqual({ accepted: true, dayId: 'mon' });
  });

  it('turns away the overnight points between a forgotten Monday and Tuesday check-in', () => {
    // Monday ends 2026-11-16T18:30Z; +6 h is 2026-11-17T00:30Z. Tuesday begins 04:00Z.
    expect(on('2026-11-17T01:00:00Z')).toEqual({ accepted: false, reason: 'outside_duty' });
    expect(on('2026-11-17T03:59:00Z')).toEqual({ accepted: false, reason: 'outside_duty' });
    expect(on('2026-11-17T00:29:00Z')).toEqual({ accepted: true, dayId: 'mon' });
  });

  it('caps a forgotten open day even when there is no next check-in yet', () => {
    const later = new Date('2026-11-17T08:00:00Z');
    expect(on('2026-11-17T02:00:00Z', [monday], later)).toEqual({
      accepted: false,
      reason: 'outside_duty',
    });
  });

  it('takes the points of a resumed day (open again) up to now', () => {
    const resumed = { ...monday, checkOutAt: null };
    expect(on('2026-11-16T12:00:00Z', [resumed], new Date('2026-11-16T12:30:00Z'))).toEqual({
      accepted: true,
      dayId: 'mon',
    });
  });

  it('ends an auto-closed day at its check-out plus 5 minutes', () => {
    const autoClosed = { ...monday, checkOutAt: new Date('2026-11-16T13:30:00Z') };
    expect(on('2026-11-16T13:34:00Z', [autoClosed, tuesday])).toEqual({
      accepted: true,
      dayId: 'mon',
    });
    expect(on('2026-11-16T13:36:00Z', [autoClosed, tuesday])).toEqual({
      accepted: false,
      reason: 'outside_duty',
    });
  });

  it('turns away a point recorded before the current consent', () => {
    expect(judge({ consentedAt: at(-30), recordedAt: at(-40) })).toEqual({
      accepted: false,
      reason: 'no_consent',
    });
    expect(judge({ consentedAt: at(-30), recordedAt: at(-20) })).toEqual({
      accepted: true,
      dayId: 'day-1',
    });
  });
});

describe('the route summary', () => {
  it('is empty for no points', () => {
    expect(summariseDutyRoute([])).toEqual({
      count: 0,
      firstAt: null,
      lastAt: null,
      mockedCount: 0,
      maxGapMinutes: 0,
    });
  });

  it('counts points, mocked ones and the longest gap in whole minutes', () => {
    const points = [
      { recordedAt: at(-60), mocked: false },
      { recordedAt: at(-58), mocked: true },
      { recordedAt: at(-30.5), mocked: false },
      { recordedAt: at(-29), mocked: true },
    ];
    expect(summariseDutyRoute(points)).toEqual({
      count: 4,
      firstAt: at(-60),
      lastAt: at(-29),
      mockedCount: 2,
      maxGapMinutes: 27,
    });
  });
});
