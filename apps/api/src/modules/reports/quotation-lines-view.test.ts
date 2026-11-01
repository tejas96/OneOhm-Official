import type { QuotationDetail } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { customerLines } from './quotation-lines-view';

type Line = QuotationDetail['lines'][number];

const line = (
  key: string,
  category: Line['category'],
  amount: number,
  extra?: Line['extra'],
): Line => ({
  key,
  description: key,
  category,
  quantity: 1,
  unit: 'nos',
  unitPricePaise: amount,
  taxRateBp: category === 'installation' ? 1800 : 500,
  basis: 'catalog',
  amountPaise: amount,
  contingencyPaise: 0,
  discountPaise: 0,
  taxPaise: 0,
  totalPaise: amount,
  costPaise: 0,
  extra: extra ?? null,
  reason: null,
});

describe('customerLines', () => {
  it('shows systems, not cable sizes: groups of engine lines become one row', () => {
    const rows = customerLines([
      line('panel', 'panel', 100_000_00),
      line('inverter', 'inverter', 50_000_00),
      line('al_rail', 'structure', 15_000_00),
      line('mid_clamp', 'structure', 1_500_00),
      line('dc_cable', 'cable', 2_000_00),
      line('installation', 'installation', 20_000_00),
      line('scaffolding', 'installation', 3_000_00),
      line('extra_1', 'other', 500_00, 'gift'),
      line('extra_2', 'other', 900_00, 'optional'),
    ]);
    expect(rows.map((row) => [row.description, row.quantity, row.gst, row.amount])).toEqual([
      ['panel', '1 nos', '5%', '₹1,00,000'],
      ['inverter', '1 nos', '5%', '₹50,000'],
      ['Mounting structure with all parts, fasteners and fabrication', '1 lot', '5%', '₹16,500'],
      ['dc_cable', '1 nos', '5%', '₹2,000'],
      ['Installation, commissioning and site work', '1 lot', '18%', '₹23,000'],
      ['extra_1', '1 nos', '—', 'Free'],
    ]);
    expect(rows.map((row) => row.index)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
