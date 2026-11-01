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

  it('keeps the quote where the survey said nothing usable', () => {
    expect(surveyedInput(quote, new Map([['site_floors', 'two']]))).toMatchObject({
      floors: 1,
      structureType: 'rcc_elevated',
    });
  });
});
