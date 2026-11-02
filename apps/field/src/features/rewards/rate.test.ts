import { describe, expect, it } from 'vitest';
import { ratePercent } from './rate';

describe('ratePercent', () => {
  it('shows a dash when nothing was judged', () => {
    expect(ratePercent(null)).toBe('–');
  });

  it('rounds to a whole percent', () => {
    expect(ratePercent(0.875)).toBe('88%');
    expect(ratePercent(1)).toBe('100%');
    expect(ratePercent(0)).toBe('0%');
  });
});
