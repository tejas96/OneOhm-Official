import { DEFAULT_WARRANTY_POLICY } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { assetsFrom } from './installed-assets.record';

const product = (id: string, name: string, wattageWp: number | null = null) => ({
  id,
  name,
  brand: 'Maker (test)',
  wattageWp,
});

const base = {
  projectId: '00000000-0000-4000-8000-000000000001',
  startsOn: '2026-11-01',
  policy: DEFAULT_WARRANTY_POLICY,
  panel: product('p', 'Mono PERC module', 545),
  inverters: [{ product: product('i', 'On-grid inverter 3 kW'), quantity: 1 }],
  battery: undefined,
  moduleCount: 6,
  lines: new Map([
    ['structure', 'Elevated RCC-roof structure'],
    ['installation', 'Installation and commissioning'],
  ]),
  facts: new Map([
    ['module_serial_numbers', 'SN1, SN2\nSN3'],
    ['inverter_serial_number', 'INV-1'],
  ]),
  installer: 'OneOhm',
};

describe('installed assets from the quotation', () => {
  it('records panels, inverter, structure and workmanship with serials and cover', () => {
    const rows = assetsFrom(base);
    expect(rows.map((row) => row.kind)).toEqual(['panel', 'inverter', 'structure', 'workmanship']);
    const [panel, inverter, structure, work] = rows;
    expect(panel).toMatchObject({
      make: 'Maker (test)',
      model: 'Mono PERC module (545 Wp)',
      quantity: 6,
      serialNumbers: ['SN1', 'SN2', 'SN3'],
      warrantyEndsOn: '2036-10-31',
      performanceEndsOn: '2051-10-31',
    });
    expect(inverter).toMatchObject({ serialNumbers: ['INV-1'], warrantyEndsOn: '2031-10-31' });
    expect(structure).toMatchObject({ make: null, model: 'Elevated RCC-roof structure' });
    expect(work).toMatchObject({ make: 'OneOhm', warrantyEndsOn: '2027-10-31' });
  });

  it('records several inverter models as one inverter asset with every serial', () => {
    const rows = assetsFrom({
      ...base,
      inverters: [
        { product: product('i', 'On-grid inverter 5 kW'), quantity: 2 },
        { product: product('j', 'On-grid inverter 3 kW'), quantity: 1 },
      ],
      facts: new Map([['inverter_serial_number', 'INV-1, INV-2, INV-3']]),
    });
    expect(rows.filter((row) => row.kind === 'inverter')).toHaveLength(1);
    expect(rows.find((row) => row.kind === 'inverter')).toMatchObject({
      make: 'Maker (test)',
      model: 'On-grid inverter 5 kW × 2, On-grid inverter 3 kW',
      productId: 'i',
      quantity: 3,
      serialNumbers: ['INV-1', 'INV-2', 'INV-3'],
    });
  });

  it('adds the battery with its serial, and trusts the counted panels over the quote', () => {
    const rows = assetsFrom({
      ...base,
      battery: product('b', 'Lithium battery 5 kWh'),
      facts: new Map([
        ['module_count', '7'],
        ['battery_serial_number', 'BAT-9'],
      ]),
    });
    expect(rows.find((row) => row.kind === 'battery')?.serialNumbers).toEqual(['BAT-9']);
    expect(rows.find((row) => row.kind === 'panel')?.quantity).toBe(7);
  });

  it('records the warranty years the quotation printed for a product, else the Settings years', () => {
    const rows = assetsFrom({
      ...base,
      panel: { ...product('p', 'Mono PERC module', 545), warrantyYears: 12 },
      inverters: [{ product: { ...product('i', 'Inverter'), warrantyYears: 10 }, quantity: 1 }],
      battery: { ...product('b', 'Battery'), warrantyYears: null },
    });
    const ends = Object.fromEntries(rows.map((row) => [row.kind, row.warrantyEndsOn]));
    expect(ends.panel).toBe('2038-10-31');
    expect(ends.inverter).toBe('2036-10-31');
    // No years on the product: the Settings years (5 for a battery).
    expect(ends.battery).toBe('2031-10-31');
    // Panels keep the Settings performance cover.
    expect(rows[0]?.performanceEndsOn).toBe('2051-10-31');
  });

  it('records the shortest years when inverter models differ', () => {
    const rows = assetsFrom({
      ...base,
      inverters: [
        { product: { ...product('a', 'A'), warrantyYears: 10 }, quantity: 1 },
        { product: { ...product('b', 'B'), warrantyYears: 7 }, quantity: 1 },
      ],
    });
    expect(rows.find((row) => row.kind === 'inverter')?.warrantyEndsOn).toBe('2033-10-31');
  });
});
