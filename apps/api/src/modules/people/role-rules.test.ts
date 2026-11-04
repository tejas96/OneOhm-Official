import { describe, expect, it } from 'vitest';
import { archivedAtAfter, roleNameTaken } from './role-rules';

describe('roleNameTaken', () => {
  const others = [
    { id: 'r-sales', name: 'Sales', archived: false },
    { id: 'r-old', name: 'Old crew', archived: true },
  ];

  it('refuses a name another active role has, whatever the capitals', () => {
    expect(roleNameTaken('r-me', '  sales ', others)).toBe(true);
  });

  it('allows a name only an archived role has', () => {
    expect(roleNameTaken('r-me', 'Old crew', others)).toBe(false);
  });

  it('allows a role to keep its own name', () => {
    expect(roleNameTaken('r-sales', 'SALES', others)).toBe(false);
  });
});

describe('archivedAtAfter', () => {
  const then = new Date('2026-01-01T00:00:00Z');
  const now = new Date('2026-11-04T00:00:00Z');

  it('keeps the original archive date when saving a role already archived', () => {
    expect(archivedAtAfter(then, true, now)).toBe(then);
  });

  it('stamps today when archiving, and clears it when restoring', () => {
    expect(archivedAtAfter(null, true, now)).toBe(now);
    expect(archivedAtAfter(then, false, now)).toBeNull();
  });

  it('leaves the date alone when archive is not part of the change', () => {
    expect(archivedAtAfter(then, undefined, now)).toBe(then);
  });
});
