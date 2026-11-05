import { describe, expect, it } from 'vitest';
import { holdActive } from './bank-hold';

describe('holdActive', () => {
  const now = new Date('2026-11-05T10:00:00Z');
  it('is active until the hold time', () => {
    expect(holdActive({ until: '2026-11-05T12:00:00Z' }, now)).toBe(true);
    expect(holdActive({ until: '2026-11-05T09:00:00Z' }, now)).toBe(false);
    expect(holdActive(null, now)).toBe(false);
  });
});
