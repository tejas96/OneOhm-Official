import { describe, expect, it } from 'vitest';
import { suggestPanel } from './default-products';

const panels = [
  { id: 'a', active: true, dcr: false, pricePaise: 100 },
  { id: 'b', active: true, dcr: true, pricePaise: 300 },
  { id: 'c', active: true, dcr: true, pricePaise: 200 },
  { id: 'd', active: false, dcr: true, pricePaise: 50 },
];

describe('suggestPanel', () => {
  it('takes the cheapest active DCR panel for individual and society', () => {
    expect(suggestPanel(panels, 'individual')?.id).toBe('c');
    expect(suggestPanel(panels, 'society')?.id).toBe('c');
  });
  it('takes the cheapest active non-DCR panel for commercial', () => {
    expect(suggestPanel(panels, 'commercial')?.id).toBe('a');
  });
  it('falls back to the cheapest active panel when none is of the wanted kind', () => {
    expect(suggestPanel(panels.slice(0, 1), 'individual')?.id).toBe('a');
  });
  it('returns null when nothing is active', () => {
    expect(suggestPanel(panels.slice(3), 'individual')).toBeNull();
    expect(suggestPanel([], 'commercial')).toBeNull();
  });
});
