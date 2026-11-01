import { describe, expect, it } from 'vitest';
import { formatKwp, formatWp } from './format-capacity';

describe('capacity formatting', () => {
  it('shows kWp with up to two decimals', () => {
    expect(formatKwp(5400)).toBe('5.4 kWp');
    expect(formatKwp(3270)).toBe('3.27 kWp');
    expect(formatKwp(46_800)).toBe('46.8 kWp');
  });

  it('shows a module rating in Wp', () => {
    expect(formatWp(545)).toBe('545 Wp');
  });
});
