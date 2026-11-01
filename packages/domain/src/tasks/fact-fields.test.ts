import { describe, expect, it } from 'vitest';
import { factField, factLabel } from './fact-fields';

describe('fact fields', () => {
  it('describes known facts with their input kind and hint', () => {
    expect(factField('sanction_date')).toEqual({
      key: 'sanction_date',
      label: 'DISCOM sanction date',
      input: 'date',
    });
    expect(factField('module_serial_numbers').input).toBe('long');
    expect(factField('module_serial_numbers').hint).toMatch(/one per line/i);
  });

  it('gives unknown facts a readable label and a sensible input', () => {
    expect(factLabel('roof_access_notes')).toBe('Roof access notes');
    expect(factField('handover_date').input).toBe('date');
    expect(factField('roof_access_notes').input).toBe('text');
  });
});
