import { describe, expect, it } from 'vitest';
import { monthOf, monthRange, previousMonth } from './month';

describe('India months', () => {
  it('an instant just after midnight IST belongs to the new India month', () => {
    expect(monthOf(new Date('2026-10-31T19:00:00Z'))).toBe('2026-11');
  });

  it('month range covers the whole month', () => {
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthRange('2026-12')).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });

  it('previous month wraps the year', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-11')).toBe('2026-10');
  });
});
