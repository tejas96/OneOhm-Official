import { describe, expect, it } from 'vitest';
import { atAcceptedPrice } from './accepted-prices';

const panel = {
  id: 'p',
  name: 'Panel',
  unit: 'nos',
  pricePaise: 15_000_00,
  costPaise: 12_000_00,
  taxRateBp: 500,
  wattageWp: 540,
  dcr: true,
};

describe('atAcceptedPrice', () => {
  it('uses the price, cost and GST saved on the accepted line', () => {
    const saved = [
      { key: 'panel', unitPricePaise: 14_000_00, unitCostPaise: 11_000_00, taxRateBp: 1200 },
    ];
    expect(atAcceptedPrice(panel, saved, 'panel')).toEqual({
      ...panel,
      pricePaise: 14_000_00,
      costPaise: 11_000_00,
      taxRateBp: 1200,
    });
  });

  it("keeps today's catalog price when the line is missing", () => {
    expect(atAcceptedPrice(panel, [], 'panel')).toBe(panel);
  });
});
