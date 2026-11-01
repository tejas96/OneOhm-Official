import { describe, expect, it } from 'vitest';
import {
  describeUnaccounted,
  overrideReasonProblem,
  unaccountedMaterial,
} from './handover-material';

const line = (description: string, withContractor: number, unit = 'nos') => ({
  description,
  unit,
  withContractor,
});

describe('handover material reconciliation', () => {
  it('lists only lines still with a contractor, largest first', () => {
    const lines = [line('Panels', 0), line('MC4 connectors', 4), line('DC cable', 12, 'm')];
    expect(unaccountedMaterial(lines).map((row) => row.description)).toEqual([
      'DC cable',
      'MC4 connectors',
    ]);
  });

  it('treats rounding dust as settled and over-returns as unaccounted', () => {
    expect(unaccountedMaterial([line('Cable', 0.0001)])).toEqual([]);
    expect(unaccountedMaterial([line('Cable', -2, 'm')])).toHaveLength(1);
  });

  it('names each line with its quantity for the message', () => {
    expect(describeUnaccounted([line('DC cable', 12.5, 'm'), line('Lugs', 4)])).toBe(
      'DC cable: 12.5 m; Lugs: 4 nos',
    );
    const many = ['A', 'B', 'C', 'D', 'E'].map((name) => line(name, 1));
    expect(describeUnaccounted(many)).toBe('A: 1 nos; B: 1 nos; C: 1 nos and 2 more');
  });

  it('asks for a real reason to hand over anyway', () => {
    expect(overrideReasonProblem('ok')).toMatch(/sentence/);
    expect(overrideReasonProblem('Crew returns the cable on Monday; customer leaving town.')).toBe(
      null,
    );
    expect(overrideReasonProblem('x'.repeat(501))).toMatch(/500/);
  });
});
