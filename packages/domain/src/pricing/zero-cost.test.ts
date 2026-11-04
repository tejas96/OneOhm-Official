import { describe, expect, it } from 'vitest';
import { zeroCostLines } from './bom-lines';
import { card, inverter, panel, site } from './costing.fixtures';
import { designSystem } from './system-bom';

const design = (panelCost: number, mode: 'rates' | 'margin') =>
  designSystem({
    targetWp: 5_000,
    panel: { ...panel, costPaise: panelCost },
    inverters: [{ product: inverter, quantity: 1 }],
    battery: undefined,
    site,
    rates: { ...card, pricing: { mode, marginBp: 2_000 } },
  });

describe('zeroCostLines', () => {
  it('names a line that cost plus target margin would quote at ₹0', () => {
    const rates = { ...card, pricing: { mode: 'margin' as const, marginBp: 2_000 } };
    expect(zeroCostLines(rates, design(0, 'margin').lines)).toEqual(['Module (545 Wp, DCR)']);
  });

  it('finds nothing when every line has a cost, or prices come from the rate card', () => {
    const margin = { ...card, pricing: { mode: 'margin' as const, marginBp: 2_000 } };
    expect(zeroCostLines(margin, design(panel.costPaise, 'margin').lines)).toEqual([]);
    expect(zeroCostLines(card, design(0, 'rates').lines)).toEqual([]);
  });
});
