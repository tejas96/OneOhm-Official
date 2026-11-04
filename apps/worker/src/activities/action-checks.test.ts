import { describe, expect, it } from 'vitest';
import { checkDue } from './action-checks';

const DAY = 86_400_000;
const now = new Date('2026-11-05T06:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY);

describe('checkDue', () => {
  it('tells the owner after 1 day and the manager after 2', () => {
    expect(checkDue(ago(0.5), now)).toBeNull();
    expect(checkDue(ago(1), now)).toBe('owner');
    expect(checkDue(ago(1.9), now)).toBe('owner');
    expect(checkDue(ago(2), now)).toBe('manager');
    expect(checkDue(ago(14), now)).toBeNull();
  });
});
