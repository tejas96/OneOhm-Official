import type { StockMovement, StockRow } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { filterStock, matchesMovement } from './stock-filters';

const row = (patch: Partial<StockRow>): StockRow => ({
  productId: '00000000-0000-4000-8000-000000000001',
  sku: 'PNL-540',
  name: 'Mono PERC 540 W',
  brand: 'Waaree',
  category: 'panel',
  unit: 'pcs',
  serialised: true,
  onHand: 10,
  reserved: 0,
  available: 10,
  minimum: null,
  low: false,
  valuePaise: 0,
  byLocation: [],
  ...patch,
});

describe('filterStock', () => {
  const panel = row({});
  const cable = row({
    productId: '00000000-0000-4000-8000-000000000002',
    sku: 'CBL-4',
    name: 'DC cable 4 sq mm',
    brand: 'Polycab',
    category: 'cable',
    onHand: 0,
    low: true,
  });
  const rows = [panel, cable];
  const all = { search: '', show: 'all', category: 'all' } as const;

  it('keeps everything with no filters', () => {
    expect(filterStock(rows, all)).toEqual(rows);
  });

  it('searches name, SKU, brand and the category label', () => {
    expect(filterStock(rows, { ...all, search: 'polycab' })).toEqual([cable]);
    expect(filterStock(rows, { ...all, search: 'pnl-540' })).toEqual([panel]);
    expect(filterStock(rows, { ...all, search: 'solar' }, () => 'Solar modules')).toEqual(rows);
  });

  it('filters to low stock, in stock, or one category', () => {
    expect(filterStock(rows, { ...all, show: 'low' })).toEqual([cable]);
    expect(filterStock(rows, { ...all, show: 'inStock' })).toEqual([panel]);
    expect(filterStock(rows, { ...all, category: panel.category })).toEqual([panel]);
  });
});

describe('matchesMovement', () => {
  const movement: StockMovement = {
    id: '00000000-0000-4000-8000-000000000003',
    productName: 'Mono PERC 540 W',
    unit: 'pcs',
    locationName: 'Main store',
    kind: 'dispatch',
    onHandDelta: -4,
    reservedDelta: 0,
    projectCode: 'OH-2026-014',
    note: 'DC-0042',
    by: 'Asha Patil',
    at: '2026-01-04T10:00:00.000Z',
  };

  it('matches product, project, note, person and the kind label', () => {
    expect(matchesMovement('perc oh-2026-014', movement)).toBe(true);
    expect(matchesMovement('asha dc-0042', movement)).toBe(true);
    expect(matchesMovement('dispatched', movement, 'Dispatched')).toBe(true);
    expect(matchesMovement('inverter', movement)).toBe(false);
  });
});
