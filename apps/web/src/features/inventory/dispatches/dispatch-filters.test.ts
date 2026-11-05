import type { Dispatch } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { matchesDispatch } from './dispatch-filters';

describe('matchesDispatch', () => {
  const dispatch: Dispatch = {
    id: '00000000-0000-4000-8000-000000000001',
    number: 'DC-2026-0042',
    projectId: '00000000-0000-4000-8000-000000000002',
    projectCode: 'OH-2026-014',
    projectName: 'Kulkarni residence',
    locationName: 'Main store',
    dispatchedOn: '2026-01-04',
    vehicle: 'MH12AB1234',
    driverName: 'Ramesh',
    driverPhone: null,
    notes: null,
    contractor: { id: '00000000-0000-4000-8000-000000000003', name: 'Kamble Installers' },
    lines: [
      {
        productId: '00000000-0000-4000-8000-000000000004',
        name: 'Mono PERC 540 W',
        unit: 'pcs',
        quantity: 2,
        serials: ['WR540-0001', 'WR540-0002'],
      },
    ],
    by: null,
  };

  it('matches challan, project, vehicle, contractor, items and serials', () => {
    expect(matchesDispatch('dc-2026-0042', dispatch)).toBe(true);
    expect(matchesDispatch('kulkarni mh12ab1234', dispatch)).toBe(true);
    expect(matchesDispatch('kamble', dispatch)).toBe(true);
    expect(matchesDispatch('perc wr540-0002', dispatch)).toBe(true);
  });

  it('drops challans missing a word', () => {
    expect(matchesDispatch('inverter', dispatch)).toBe(false);
  });
});
