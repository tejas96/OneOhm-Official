import { describe, expect, it } from 'vitest';
import { markBlank, withBlankErrors } from './blank-fields';

describe('blank number boxes', () => {
  it('a cleared box shows its own message over the server one', () => {
    const errors = withBlankErrors({ days: 'Server says no', other: 'x' }, new Set(['days']), {
      days: 'Enter a number of days.',
    });
    expect(errors).toEqual({ days: 'Enter a number of days.', other: 'x' });
  });

  it('marks and unmarks a box as it is cleared and filled', () => {
    const blank = markBlank(new Set<string>(), 'days', null);
    expect(blank.has('days')).toBe(true);
    expect(markBlank(blank, 'days', 3).has('days')).toBe(false);
  });
});
