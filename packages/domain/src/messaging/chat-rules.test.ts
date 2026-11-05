import { describe, expect, it } from 'vitest';
import {
  CALL_DAY_WORDS,
  CHAT_WINDOW_HOURS,
  callDay,
  chatWaitStage,
  chatWindowOpen,
  isWorkingTime,
  lastWorkEnd,
  pickAnswerer,
  replyTime,
  soleCustomer,
  workingMinutesBetween,
  workingMinutesSince,
} from './chat-rules';

const TZ = 'Asia/Kolkata';
/** A time in India on 2 Nov 2026 (UTC+5:30). */
const ist = (hhmm: string) => new Date(`2026-11-02T${hhmm}:00+05:30`);

describe('chat wait stage', () => {
  it('waits 30 minutes, then nudges, then tells the desk after 2 hours', () => {
    expect(chatWaitStage(ist('11:00'), ist('11:20'), TZ)).toBeNull();
    // 6:00 pm to 6:30 pm counts; after 6:30 pm the clock stops (same hours customers are told).
    expect(chatWaitStage(ist('17:55'), ist('18:29'), TZ)).toBe(1);
    expect(chatWaitStage(ist('11:00'), ist('11:31'), TZ)).toBe(1);
    expect(chatWaitStage(ist('11:00'), ist('13:05'), TZ)).toBe(2);
  });

  it('stays quiet outside working hours', () => {
    expect(chatWaitStage(ist('18:00'), ist('19:00'), TZ)).toBeNull();
    expect(chatWaitStage(ist('06:00'), ist('08:59'), TZ)).toBeNull();
  });

  it('counts an overnight message from 9:30 in the morning', () => {
    const night = new Date('2026-11-01T23:30:00+05:30');
    expect(chatWaitStage(night, ist('09:40'), TZ)).toBeNull();
    expect(chatWaitStage(night, ist('10:05'), TZ)).toBe(1);
    expect(chatWaitStage(night, ist('11:35'), TZ)).toBe(2);
  });
});

describe('working minutes since', () => {
  it('counts from the time, or from 9:30 for anything before today began, never at night', () => {
    expect(workingMinutesSince(ist('10:00'), ist('14:00'), TZ)).toBe(240);
    expect(workingMinutesSince(new Date('2026-11-01T17:00:00+05:30'), ist('13:30'), TZ)).toBe(240);
    expect(workingMinutesSince(ist('10:00'), ist('19:00'), TZ)).toBe(0);
  });
});

describe('working time', () => {
  it('is 9:30 am up to 6:30 pm, the hours customers are told', () => {
    expect(isWorkingTime(ist('09:29'), TZ)).toBe(false);
    expect(isWorkingTime(ist('09:30'), TZ)).toBe(true);
    expect(isWorkingTime(ist('18:29'), TZ)).toBe(true);
    expect(isWorkingTime(ist('18:30'), TZ)).toBe(false);
  });

  it('is closed all Sunday (1 Nov 2026), open on Saturday (7 Nov)', () => {
    expect(isWorkingTime(new Date('2026-11-01T11:00:00+05:30'), TZ)).toBe(false);
    expect(isWorkingTime(new Date('2026-11-07T11:00:00+05:30'), TZ)).toBe(true);
    // No working minutes on a Sunday, so nothing is late and no chat is handed back.
    expect(
      workingMinutesSince(
        new Date('2026-11-01T09:00:00+05:30'),
        new Date('2026-11-01T15:00:00+05:30'),
        TZ,
      ),
    ).toBe(0);
    expect(
      chatWaitStage(
        new Date('2026-11-01T10:00:00+05:30'),
        new Date('2026-11-01T16:00:00+05:30'),
        TZ,
      ),
    ).toBeNull();
  });
});

describe('the last work end skips Sunday', () => {
  it('is Saturday 6:30 pm all through Sunday and Monday morning', () => {
    const sat = new Date('2026-10-31T18:30:00+05:30').toISOString();
    for (const at of ['2026-11-01T10:00', '2026-11-01T21:00', '2026-11-02T08:00'])
      expect(lastWorkEnd(new Date(`${at}:00+05:30`), TZ).toISOString(), at).toBe(sat);
  });
});

describe('when a promised call is due', () => {
  const at = (iso: string) => callDay(new Date(`${iso}:00+05:30`), TZ);
  it('is today in working hours; Friday evening → Saturday; Saturday evening and Sunday → Monday', () => {
    expect(at('2026-11-06T11:00')).toEqual({ day: 'today', add: 0 });
    expect(at('2026-11-06T20:00')).toEqual({ day: 'tomorrow', add: 1 });
    expect(at('2026-11-07T20:00')).toEqual({ day: 'monday', add: 2 });
    expect(at('2026-11-08T11:00')).toEqual({ day: 'tomorrow', add: 1 });
    expect(at('2026-11-09T08:00')).toEqual({ day: 'today', add: 0 });
    expect(CALL_DAY_WORDS.monday).toBe('on Monday morning');
  });
});

describe('when a person can reply', () => {
  const at = (iso: string) => replyTime(new Date(`${iso}:00+05:30`), TZ);
  it('is now in working hours, else the next 9:30 (Saturday evening → Monday)', () => {
    expect(at('2026-11-02T11:00')).toBe('now');
    expect(at('2026-11-02T08:00')).toBe('today');
    expect(at('2026-11-02T19:00')).toBe('tomorrow');
    expect(at('2026-11-07T19:00')).toBe('monday');
    expect(at('2026-11-01T08:00')).toBe('tomorrow');
    expect(at('2026-11-01T20:00')).toBe('tomorrow');
  });
});

describe('who answers', () => {
  it('is the owner, else their backup today, else the desk (null)', () => {
    expect(pickAnswerer({ owner: 'a', ownerActive: true, backupToday: null })).toBe('a');
    expect(pickAnswerer({ owner: 'a', ownerActive: false, backupToday: 'b' })).toBe('b');
    expect(pickAnswerer({ owner: 'a', ownerActive: false, backupToday: null })).toBeNull();
    expect(pickAnswerer({ owner: null, ownerActive: false, backupToday: null })).toBeNull();
  });
});

describe('last end of working hours', () => {
  it('is 6:30 pm today after 6:30 pm, else 6:30 pm yesterday', () => {
    expect(lastWorkEnd(ist('22:15'), TZ).toISOString()).toBe(ist('18:30').toISOString());
    // 2 Nov is a Monday: yesterday was Sunday (closed), so Saturday's end.
    expect(lastWorkEnd(ist('06:30'), TZ).toISOString()).toBe(
      new Date('2026-10-31T18:30:00+05:30').toISOString(),
    );
  });
});

describe('the customer behind a family number', () => {
  it('is that customer only when the number belongs to exactly one', () => {
    expect(soleCustomer([{ id: 'a', name: 'A' }])).toEqual({ id: 'a', name: 'A' });
    expect(
      soleCustomer([
        { id: 'a', name: 'A' },
        { id: 'a', name: 'A' },
      ])?.id,
    ).toBe('a');
    // On two customers' lists: a stranger, so nobody sees the wrong customer's papers.
    expect(
      soleCustomer([
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ]),
    ).toBeNull();
    expect(soleCustomer([])).toBeNull();
  });
});

describe('chat window', () => {
  const now = new Date('2026-11-03T12:00:00Z');
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3600_000);

  it('is open within 23 hours of the customer writing, an hour before Meta closes it', () => {
    expect(CHAT_WINDOW_HOURS).toBe(23);
    expect(chatWindowOpen(hoursAgo(1), now)).toBe(true);
    expect(chatWindowOpen(hoursAgo(22.9), now)).toBe(true);
    expect(chatWindowOpen(hoursAgo(23.1), now)).toBe(false);
  });

  it('is closed when the customer never wrote', () => {
    expect(chatWindowOpen(null, now)).toBe(false);
    expect(chatWindowOpen(undefined, now)).toBe(false);
  });
});

describe('workingMinutesBetween', () => {
  const at = (day: string, utc: string) => new Date(`${day}T${utc}:00Z`);
  it('counts only Monday to Saturday 9:30 to 18:30 (IST)', () => {
    // Friday 17:30 to Monday 09:30: one hour on Friday, a whole Saturday, no Sunday.
    expect(
      workingMinutesBetween(at('2026-11-06', '12:00'), at('2026-11-09', '04:00'), 'Asia/Kolkata'),
    ).toBe(600);
    expect(
      workingMinutesBetween(at('2026-11-08', '04:00'), at('2026-11-08', '12:00'), 'Asia/Kolkata'),
    ).toBe(0);
    expect(
      workingMinutesBetween(at('2026-11-05', '06:00'), at('2026-11-05', '05:00'), 'Asia/Kolkata'),
    ).toBe(0);
  });
});
