import { describe, expect, it } from 'vitest';
import { arrivedIsNews } from './visit-news-send';

const NOW = new Date('2026-11-16T12:00:00Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

describe('arrivedIsNews', () => {
  it('is news for a fresh, open check-in', () => {
    expect(arrivedIsNews({ checkInAt: minutesAgo(2), checkOutAt: null }, NOW)).toBe(true);
  });

  it('is not news once the visit has checked out (a late upload)', () => {
    const row = { checkInAt: minutesAgo(40), checkOutAt: minutesAgo(30) };
    expect(arrivedIsNews(row, NOW)).toBe(false);
  });

  it('is not news for an old check-in that only reached the server now', () => {
    expect(arrivedIsNews({ checkInAt: minutesAgo(25), checkOutAt: null }, NOW)).toBe(false);
  });
});
