import { describe, expect, it } from 'vitest';
import { autoClosedNotice, delayedTapNotice, jobFailedNotice } from './attendance-notices';

const day = {
  dayId: 'd1',
  workDate: '2026-11-09',
  closedAt: new Date('2026-11-09T12:42:00Z'), // 6:12 pm India
  timeZone: 'Asia/Kolkata',
};

describe('auto-closed day notices', () => {
  it('tells the person when and why, with how to fix it', () => {
    const notice = autoClosedNotice('self', day, 'Ravi');
    expect(notice.title).toBe('Your Mon, 9 Nov was ended for you');
    expect(notice.body).toContain('6:12 pm');
    expect(notice.body).toContain('correction');
  });

  it('tells the approvers who it was, with a different key', () => {
    const team = autoClosedNotice('team', day, 'Ravi');
    expect(team.title).toBe('Ravi did not check out on Mon, 9 Nov');
    expect(team.dedupeKey).not.toBe(autoClosedNotice('self', day, 'Ravi').dedupeKey);
  });
});

describe('failed job notice', () => {
  it('names the job and is once a day per job', () => {
    const notice = jobFailedNotice('payment_reminders', 'connection refused', '2026-11-15');
    expect(notice.title).toContain('payment reminders');
    expect(notice.dedupeKey).toBe('job_failed:payment_reminders:2026-11-15');
  });
});

describe('delayed tap notice', () => {
  const tap = {
    dayId: 'd1',
    workDate: '2026-11-09',
    kind: 'check_in' as const,
    tappedAt: new Date('2026-11-09T03:30:00Z'), // 9:00 am India
    receivedAt: new Date('2026-11-09T07:30:00Z'), // 1:00 pm India
    timeZone: 'Asia/Kolkata',
  };

  it('tells the manager both times so the day can be reviewed', () => {
    const notice = delayedTapNotice(tap, 'Ravi');
    expect(notice.title).toContain('Ravi');
    expect(notice.body).toContain('9:00 am');
    expect(notice.body).toContain('1:00 pm');
  });

  it('is one alert per day, whichever tap was late', () => {
    expect(delayedTapNotice({ ...tap, kind: 'check_out' }, 'Ravi').dedupeKey).toBe(
      delayedTapNotice(tap, 'Ravi').dedupeKey,
    );
  });
});
