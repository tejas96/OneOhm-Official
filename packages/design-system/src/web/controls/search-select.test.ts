import { describe, expect, it } from 'vitest';
import { filterOptions } from './search-select';

const options = [
  { value: 'a', label: 'Hybrid inverter 5 kW', keywords: 'INV-HYB-5K Starter' },
  { value: 'b', label: 'On-grid inverter 5 kW', keywords: 'INV-5K' },
  { value: 'c', label: 'On-grid inverter 10 kW', description: 'Three phase' },
];

describe('filterOptions', () => {
  it('returns everything for an empty search', () => {
    expect(filterOptions(options, '  ')).toHaveLength(3);
  });

  it('matches every word, in any order and case', () => {
    expect(filterOptions(options, 'kw HYBRID').map((option) => option.value)).toEqual(['a']);
    expect(filterOptions(options, 'on-grid 5').map((option) => option.value)).toEqual(['b']);
  });

  it('matches the start of words only, so 5 kW is not 25 kW', () => {
    const list = [...options, { value: 'd', label: 'On-grid inverter 25 kW' }];
    expect(filterOptions(list, '5kw').map((option) => option.value)).toEqual(['a', 'b']);
  });

  it('treats "5 kw" and "5kw" alike', () => {
    expect(filterOptions(options, '5kw').map((option) => option.value)).toEqual(['a', 'b']);
    expect(filterOptions(options, '10 kw').map((option) => option.value)).toEqual(['c']);
  });

  it('searches hidden keywords and the description', () => {
    expect(filterOptions(options, 'inv-hyb').map((option) => option.value)).toEqual(['a']);
    expect(filterOptions(options, 'three phase').map((option) => option.value)).toEqual(['c']);
  });
});
