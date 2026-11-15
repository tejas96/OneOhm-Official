import { describe, expect, it } from 'vitest';
import { hasAdSpend, salesPerRupee } from './campaign-spend';

describe('campaign spend', () => {
  it('shows the money columns only when some row spent', () => {
    expect(hasAdSpend([{ spendPaise: 0 }, { spendPaise: 0 }])).toBe(false);
    expect(hasAdSpend([])).toBe(false);
    expect(hasAdSpend([{ spendPaise: 0 }, { spendPaise: 500 }])).toBe(true);
  });

  it('writes sales per rupee of ads, or a dash', () => {
    expect(salesPerRupee(null)).toBe('—');
    expect(salesPerRupee(4.23)).toBe('₹4.2');
    expect(salesPerRupee(0)).toBe('₹0');
  });
});
