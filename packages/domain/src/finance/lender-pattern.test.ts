import { describe, expect, it } from 'vitest';
import {
  checkPattern,
  DEFAULT_TRANCHE_PATTERN,
  patternFor,
  planTranches,
  SINGLE_DISBURSEMENT,
} from './lender-pattern';

describe('lender disbursement patterns (PRD 3.11, 7.2)', () => {
  it('a single-payment lender pays the whole bank share at once', () => {
    expect(patternFor('single', DEFAULT_TRANCHE_PATTERN)).toBe(SINGLE_DISBURSEMENT);
    expect(planTranches(1_00_000_00, SINGLE_DISBURSEMENT)).toEqual([
      { label: 'Full disbursement', amountPaise: 1_00_000_00 },
    ]);
  });

  it('splits by the lender’s parts, the last part taking the rounding', () => {
    const parts = [
      { label: 'On sanction', shareBp: 3333 },
      { label: 'After install', shareBp: 3333 },
      { label: 'After net meter', shareBp: 3334 },
    ];
    const plan = planTranches(100_001, parts);
    expect(plan.map((part) => part.amountPaise)).toEqual([33_330, 33_330, 33_341]);
    expect(plan.reduce((sum, part) => sum + part.amountPaise, 0)).toBe(100_001);
  });

  it('falls back to the shipped split for a parts lender with none saved', () => {
    expect(patternFor('tranches', [])).toBe(DEFAULT_TRANCHE_PATTERN);
    expect(planTranches(0, DEFAULT_TRANCHE_PATTERN)).toEqual([]);
  });

  it('refuses parts that do not add up to the whole', () => {
    expect(checkPattern(DEFAULT_TRANCHE_PATTERN)).toBeNull();
    expect(checkPattern([{ label: 'All', shareBp: 9000 }])).toBe('The parts must add up to 100%.');
    expect(checkPattern([{ label: '', shareBp: 10_000 }])).toBe('Name every part.');
  });
});
