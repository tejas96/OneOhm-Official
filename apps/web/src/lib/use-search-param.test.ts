import { describe, expect, it } from 'vitest';
import { matchesSearch } from './use-search-param';

describe('matchesSearch', () => {
  const bill = ['Kamble Solar Installers', 'Work order WO-2026-0001', 'OH-2026-001', null];

  it('keeps everything when the search is empty', () => {
    expect(matchesSearch('  ', bill)).toBe(true);
  });

  it('matches every word across fields, ignoring case', () => {
    expect(matchesSearch('kamble wo-2026-0001', bill)).toBe(true);
    expect(matchesSearch('oh-2026-001', bill)).toBe(true);
  });

  it('drops rows missing a word', () => {
    expect(matchesSearch('kamble retention', bill)).toBe(false);
  });
});
