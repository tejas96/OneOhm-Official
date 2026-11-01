import type { QuotationInput } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { surveyedInput } from './survey-input';

const quote = {
  floors: 1,
  structureType: 'rcc_elevated',
  dcCableMeters: null,
  acCableMeters: null,
} as unknown as QuotationInput;

describe('surveyedInput', () => {
  it('puts the measured values into the quote', () => {
    const facts = new Map([
      ['site_floors', '3'],
      ['structure_type', 'Tin shed with purlins'],
      ['dc_cable_meters', '42 m'],
      ['ac_cable_meters', '18.5'],
    ]);
    expect(surveyedInput(quote, facts)).toMatchObject({
      floors: 3,
      structureType: 'tin_shed',
      dcCableMeters: 42,
      acCableMeters: 18.5,
    });
  });

  it('reads cable runs floor by floor and keeps runs of kinds it did not measure', () => {
    const accepted = {
      ...quote,
      costing: { visits: 2, runs: [{ kind: 'ac', acrossM: 9, upM: 3, runs: 1 }] },
    } as unknown as QuotationInput;
    const facts = new Map([
      ['structure_type', 'Aluminium rail on the RCC roof'],
      ['cable_runs', 'DC, floor 3: 12 m across, 2 runs\nDC, floor 2: 6 m up, 2 runs'],
    ]);
    expect(surveyedInput(accepted, facts)).toMatchObject({
      structureType: 'aluminium_rail',
      costing: {
        visits: 2,
        runs: [
          { kind: 'ac', acrossM: 9, upM: 3, runs: 1 },
          { kind: 'dc', floor: 3, acrossM: 12, upM: 0, runs: 2 },
          { kind: 'dc', floor: 2, acrossM: 0, upM: 6, runs: 2 },
        ],
      },
    });
  });

  it('keeps the quote where the survey said nothing usable', () => {
    expect(surveyedInput(quote, new Map([['site_floors', 'two']]))).toMatchObject({
      floors: 1,
      structureType: 'rcc_elevated',
    });
  });
});
