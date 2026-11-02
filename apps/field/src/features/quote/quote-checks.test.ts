import { describe, expect, it } from 'vitest';
import { quoteFormChecks } from './quote-checks';
import type { QuoteForm } from './quote-inputs';

const form: QuoteForm = {
  sizeKw: '3',
  dcr: true,
  panelId: null,
  inverters: null,
  structure: 'rcc_elevated',
  floors: '1',
  households: '',
  distanceKm: '0',
  discount: '',
  extras: [],
};

describe('quoteFormChecks', () => {
  it('passes a usual quote', () => {
    expect(quoteFormChecks(form, false)).toEqual({});
  });
  it('flags floors, distance and size outside what the server takes', () => {
    const checks = quoteFormChecks(
      { ...form, floors: '41', distanceKm: '1001', sizeKw: '0.1' },
      false,
    );
    expect(Object.keys(checks).sort()).toEqual(['distanceKm', 'floors', 'targetWp']);
  });
  it('asks a society for at least one household once typed', () => {
    expect(quoteFormChecks({ ...form, households: '0' }, true)).toHaveProperty('households');
    expect(quoteFormChecks({ ...form, households: '0' }, false)).toEqual({});
  });
});
