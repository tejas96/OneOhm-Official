import { describe, expect, it } from 'vitest';
import { actionReminderDue } from './action-reminders';

const DAY = 86_400_000;
const now = new Date('2026-11-05T06:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY);

describe('actionReminderDue', () => {
  it('waits for 2 days, reminds the customer, then tells the asker from 4 days', () => {
    expect(actionReminderDue(ago(1.9), now)).toBeNull();
    expect(actionReminderDue(ago(2), now)).toBe('customer');
    expect(actionReminderDue(ago(3.9), now)).toBe('customer');
    expect(actionReminderDue(ago(4), now)).toBe('team');
    expect(actionReminderDue(ago(13.9), now)).toBe('team');
  });

  it('leaves an ask older than 14 days alone', () => {
    expect(actionReminderDue(ago(14), now)).toBeNull();
  });
});
