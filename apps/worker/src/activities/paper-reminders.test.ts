import { describe, expect, it } from 'vitest';
import { paperReminderDue } from './paper-reminders';

const HOUR = 3_600_000;
const now = new Date('2026-11-10T10:00:00Z');
const askedHoursAgo = (hours: number) => new Date(now.getTime() - hours * HOUR);

describe('paperReminderDue', () => {
  it('waits before 2 days', () => {
    expect(paperReminderDue(askedHoursAgo(47), now)).toBeNull();
  });
  it('reminds the customer from 2 days', () => {
    expect(paperReminderDue(askedHoursAgo(48), now)).toBe('customer');
    expect(paperReminderDue(askedHoursAgo(49), now)).toBe('customer');
  });
  it('tells the team from 4 days', () => {
    expect(paperReminderDue(askedHoursAgo(95), now)).toBe('customer');
    expect(paperReminderDue(askedHoursAgo(97), now)).toBe('team');
  });
});
