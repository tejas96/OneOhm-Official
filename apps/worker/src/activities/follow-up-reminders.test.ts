import { describe, expect, it } from 'vitest';
import { clockPlus } from './follow-up-reminders';

describe('clockPlus', () => {
  it('adds minutes across the hour', () => {
    expect(clockPlus('09:50', 15)).toBe('10:05');
  });
  it('stops at the end of the day', () => {
    expect(clockPlus('23:50', 15)).toBe('23:59');
  });
});
