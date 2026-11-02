import { describe, expect, it } from 'vitest';
import { digestSummary, shouldSendDigest, shouldSendWhatsapp } from './staff-digest';

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

describe('who gets the morning summary', () => {
  const none = { overdue: 0, today: 0, followUps: 0, stale: 0, urgent: 0, blocking: 0 };

  it('sends a summary for stale or urgent work, but not for blocking alone', () => {
    expect(shouldSendDigest({ ...none, stale: 1 })).toBe(true);
    expect(shouldSendDigest({ ...none, urgent: 1 })).toBe(true);
    expect(shouldSendDigest({ ...none, blocking: 4 })).toBe(false);
    expect(shouldSendDigest(none)).toBe(false);
  });

  it('sends WhatsApp only when its template has something to say', () => {
    expect(shouldSendWhatsapp({ ...none, stale: 3, urgent: 1 })).toBe(false);
    expect(shouldSendWhatsapp({ ...none, overdue: 1 })).toBe(true);
    expect(shouldSendWhatsapp({ ...none, followUps: 2 })).toBe(true);
  });
});
