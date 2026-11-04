import { describe, expect, it } from 'vitest';
import { discountLimitPaise } from './discount-limit';

describe('discountLimitPaise', () => {
  it('takes the limit on the price before GST, as the discount is', () => {
    // ₹1,00,000 before GST, ₹12,000 GST: a 3% limit is ₹3,000, not ₹3,360.
    const undiscounted = { totalPaise: 1_12_000_00, taxPaise: 12_000_00 };
    expect(discountLimitPaise(undiscounted, 300)).toBe(3_000_00);
  });
});
