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
  inverter: product('i', 'On-grid inverter 3 kW'),
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
});
