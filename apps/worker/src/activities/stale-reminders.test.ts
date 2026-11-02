import { describe, expect, it } from 'vitest';
import { digestSummary } from './staff-digest';
import { staleMessage } from './stale-reminders';

describe('staleMessage', () => {
  it('writes 1 day and n days correctly', () => {
    expect(staleMessage('Site survey', 1)).toBe(
      'Site survey has had no update for 1 day. Add a note or move it on.',
    );
    expect(staleMessage('Site survey', 4)).toBe(
      'Site survey has had no update for 4 days. Add a note or move it on.',
    );
  });
});

describe('digestSummary', () => {
  it('lists only counts above zero, stale and urgent included', () => {
    expect(
      digestSummary({ overdue: 2, today: 0, followUps: 1, stale: 3, urgent: 1, blocking: 0 }),
    ).toBe('1 urgent, 2 overdue, 3 stale, 1 lead follow-ups.');
    expect(
      digestSummary({ overdue: 0, today: 1, followUps: 0, stale: 0, urgent: 0, blocking: 2 }),
    ).toBe('1 due today, 2 blocking others.');
  });
});
