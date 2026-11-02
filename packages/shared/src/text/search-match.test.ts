import { describe, expect, it } from 'vitest';
import { matchesSearch } from './search-match';

describe('matchesSearch', () => {
  it('matches every word in any order and case', () => {
    expect(matchesSearch('Hybrid inverter 5 kW', 'kw HYB')).toBe(true);
    expect(matchesSearch('Hybrid inverter 5 kW', 'grid')).toBe(false);
  });

  it('treats "5 kw" and "5kw" alike, and an empty search as a match', () => {
    expect(matchesSearch('On-grid inverter 5 kW', '5kw')).toBe(true);
    expect(matchesSearch('On-grid inverter 5kW', '5 kw')).toBe(true);
    expect(matchesSearch('On-grid inverter 25 kW', '5kw')).toBe(false);
    expect(matchesSearch('INV-HYB-5K Starter', 'inv-hyb')).toBe(true);
    expect(matchesSearch('anything', '  ')).toBe(true);
  });
});
