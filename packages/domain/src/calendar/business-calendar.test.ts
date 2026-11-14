import { describe, expect, it } from 'vitest';
import {
  callDay,
  callDayWords,
  chatWaitStage,
  lastWorkEnd,
  replyTime,
  workingMinutesBetween,
  workingMinutesSince,
} from '../messaging/chat-rules';
import { confirmDeadline, reminderDue, visitMissed } from '../visits/visit-rules';
import {
  type BusinessCalendar,
  calendarFrom,
  DEFAULT_CALENDAR,
  isWorkingDay,
  isWorkingTime,
  nextWorkingDay,
  openMinutes,
  previousWorkingDay,
} from './business-calendar';
import { clockText, daysText, hoursText, openingText } from './hours-text';

const ist = (iso: string) => new Date(`${iso}:00+05:30`);

/** Saturday off too, 10:00 to 19:00, and 12 Nov (Thursday) a holiday. */
const CAL: BusinessCalendar = calendarFrom({
  timeZone: 'Asia/Kolkata',
  weeklyOff: [0, 6],
  dayStart: '10:00',
  dayEnd: '19:00',
  lunchStart: '13:30',
  lunchEnd: '14:30',
  holidays: ['2026-11-12'],
});
// 2026-11-06 Friday, 07 Saturday, 08 Sunday, 09 Monday, 11 Wednesday, 12 Thursday (holiday).

describe('the calendar', () => {
  it('knows working days, holidays and the day length', () => {
    expect(isWorkingDay('2026-11-06', CAL)).toBe(true);
    expect(isWorkingDay('2026-11-07', CAL)).toBe(false);
    expect(isWorkingDay('2026-11-12', CAL)).toBe(false);
    expect(isWorkingDay('2026-11-07')).toBe(true);
    expect(openMinutes(CAL)).toBe(540);
    expect(nextWorkingDay('2026-11-06', CAL)).toBe('2026-11-09');
    expect(nextWorkingDay('2026-11-11', CAL)).toBe('2026-11-13');
    expect(previousWorkingDay('2026-11-09', CAL)).toBe('2026-11-06');
  });
  it('is working time only on a working day between the new hours', () => {
    expect(isWorkingTime(ist('2026-11-06T09:59'), CAL)).toBe(false);
    expect(isWorkingTime(ist('2026-11-06T10:00'), CAL)).toBe(true);
    expect(isWorkingTime(ist('2026-11-06T18:59'), CAL)).toBe(true);
    expect(isWorkingTime(ist('2026-11-06T19:00'), CAL)).toBe(false);
    expect(isWorkingTime(ist('2026-11-07T11:00'), CAL)).toBe(false);
    expect(isWorkingTime(ist('2026-11-12T11:00'), CAL)).toBe(false);
  });
  it('ignores a malformed lunch and bad hours from a saved policy', () => {
    const cal = calendarFrom({
      timeZone: 'Asia/Kolkata',
      weeklyOff: [0],
      dayStart: 'x',
      dayEnd: '18:30',
      lunchStart: '14:00',
      lunchEnd: '13:00',
    });
    expect(cal.startMin).toBe(DEFAULT_CALENDAR.startMin);
    expect(cal.lunch).toBeNull();
  });
});

describe('chat rules on a Saturday-off 10:00–19:00 calendar', () => {
  it('says when a person replies', () => {
    expect(replyTime(ist('2026-11-06T12:00'), CAL)).toBe('now');
    expect(replyTime(ist('2026-11-06T09:00'), CAL)).toBe('today');
    expect(replyTime(ist('2026-11-05T20:00'), CAL)).toBe('tomorrow');
    // Friday evening: the next opening is Monday.
    expect(replyTime(ist('2026-11-06T20:00'), CAL)).toBe('later');
    // Wednesday evening: Thursday is a holiday, so Friday.
    expect(replyTime(ist('2026-11-11T20:00'), CAL)).toBe('later');
  });
  it('promises the call for the next working morning and names the day', () => {
    expect(callDay(ist('2026-11-06T20:00'), CAL)).toEqual({ day: 'later', add: 3, weekday: 1 });
    expect(callDayWords({ day: 'later', weekday: 1 })).toBe('on Monday morning');
    expect(callDay(ist('2026-11-11T20:00'), CAL)).toEqual({ day: 'later', add: 2, weekday: 5 });
    expect(callDay(ist('2026-11-09T09:00'), CAL)).toEqual({ day: 'today', add: 0, weekday: 1 });
  });
  it('finds the last closing, skipping days off and holidays', () => {
    const friday = ist('2026-11-06T19:00').toISOString();
    expect(lastWorkEnd(ist('2026-11-07T12:00'), CAL).toISOString()).toBe(friday);
    expect(lastWorkEnd(ist('2026-11-09T08:00'), CAL).toISOString()).toBe(friday);
    expect(lastWorkEnd(ist('2026-11-06T21:00'), CAL).toISOString()).toBe(friday);
    expect(lastWorkEnd(ist('2026-11-13T09:00'), CAL).toISOString()).toBe(
      ist('2026-11-11T19:00').toISOString(),
    );
  });
  it('counts working minutes from the new opening, none on a day off', () => {
    expect(workingMinutesSince(ist('2026-11-05T09:00'), ist('2026-11-06T11:00'), CAL)).toBe(60);
    expect(workingMinutesSince(ist('2026-11-06T11:00'), ist('2026-11-07T11:00'), CAL)).toBe(0);
    // Friday 17:00 to Monday 11:00: two hours Friday, one Monday.
    expect(workingMinutesBetween(ist('2026-11-06T17:00'), ist('2026-11-09T11:00'), CAL)).toBe(180);
    // A message at 9:40 counts from 10:00 here (20 minutes at 10:20), from 9:40 at the usual hours.
    expect(chatWaitStage(ist('2026-11-06T09:40'), ist('2026-11-06T10:20'), CAL)).toBeNull();
    expect(chatWaitStage(ist('2026-11-06T09:40'), ist('2026-11-06T10:20'))).toBe(1);
  });
  it('misses a visit at the new closing time and promises the confirm by it', () => {
    expect(visitMissed('2026-11-06', ist('2026-11-06T18:30'), CAL)).toBe(false);
    expect(visitMissed('2026-11-06', ist('2026-11-06T19:00'), CAL)).toBe(true);
    // Own end plus grace: a 10:00–11:30 visit is missed from 13:30 with a 120 minute grace.
    const after = { endMin: 690, minutes: 120 };
    expect(visitMissed('2026-11-06', ist('2026-11-06T13:29'), CAL, after)).toBe(false);
    expect(visitMissed('2026-11-06', ist('2026-11-06T13:30'), CAL, after)).toBe(true);
    expect(confirmDeadline(ist('2026-11-06T14:00'), CAL).toISOString()).toBe(
      ist('2026-11-06T19:00').toISOString(),
    );
    // After closing: next working morning, open + 2.5 h.
    expect(confirmDeadline(ist('2026-11-06T20:00'), CAL).toISOString()).toBe(
      ist('2026-11-09T12:30').toISOString(),
    );
  });
  it('reminds the working day before the visit', () => {
    const base = {
      visitDay: '2026-11-09',
      confirmedOn: '2026-11-02',
      working: true,
      calendar: CAL,
    };
    expect(reminderDue({ ...base, today: '2026-11-06' })).toBe(true);
    expect(reminderDue({ ...base, today: '2026-11-05' })).toBe(false);
  });
});

describe('customer words from the calendar', () => {
  it('writes the hours and days in three languages', () => {
    expect(hoursText(DEFAULT_CALENDAR, 'en')).toBe('9:30 am–6:30 pm');
    expect(hoursText(DEFAULT_CALENDAR, 'mr')).toBe('9:30–6:30');
    expect(hoursText(CAL, 'en')).toBe('10:00 am–7:00 pm');
    expect(daysText(DEFAULT_CALENDAR, 'en')).toBe('Mon–Sat');
    expect(daysText(DEFAULT_CALENDAR, 'hi')).toBe('सोम–शनि');
    expect(daysText(CAL, 'en')).toBe('Mon–Fri');
    expect(daysText({ ...CAL, weeklyOff: [0, 2, 4] }, 'en')).toBe('Mon, Wed, Fri, Sat');
    expect(openingText(DEFAULT_CALENDAR, 'en')).toBe('Mon–Sat, 9:30 am–6:30 pm');
    expect(clockText(18 * 60 + 30, 'en')).toBe('6:30 pm');
  });
});
