import { describe, expect, it } from 'vitest';
import {
  chatWaitStage,
  isWorkingTime,
  lastWorkEnd,
  pickAnswerer,
  soleCustomer,
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

describe('working time', () => {
  it('is 9:30 am up to 6:30 pm, the hours customers are told', () => {
    expect(isWorkingTime(ist('09:29'), TZ)).toBe(false);
    expect(isWorkingTime(ist('09:30'), TZ)).toBe(true);
    expect(isWorkingTime(ist('18:29'), TZ)).toBe(true);
    expect(isWorkingTime(ist('18:30'), TZ)).toBe(false);
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
    expect(lastWorkEnd(ist('06:30'), TZ).toISOString()).toBe(
      new Date('2026-11-01T18:30:00+05:30').toISOString(),
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
