import { describe, expect, it } from 'vitest';
import { actionPattern } from './audit-search';

/** What Postgres ILIKE would do with the pattern, for checking without a database. */
function ilike(value: string, pattern: string): boolean {
  let source = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i] ?? '';
    if (char === '\\') source += (pattern[++i] ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (char === '%') source += '.*';
    else if (char === '_') source += '.';
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`, 'is').test(value);
}

describe('actionPattern', () => {
  it('finds an action by the words the screen shows', () => {
    expect(ilike('role.updated', actionPattern('Role updated'))).toBe(true);
    expect(ilike('quotation.discount_approved', actionPattern('discount  approved'))).toBe(true);
  });

  it('still finds the raw action code', () => {
    expect(ilike('role.updated', actionPattern('role.updated'))).toBe(true);
  });

  it('does not match unrelated actions', () => {
    expect(ilike('role.created', actionPattern('Role updated'))).toBe(false);
  });

  it('takes the user’s own % literally', () => {
    expect(ilike('role.updated', actionPattern('%'))).toBe(false);
  });
});
