import { describe, expect, it } from 'vitest';
import { phoneCell } from './month-sheet-csv';

describe('phoneCell', () => {
  it('writes an Indian mobile as Excel keeps it: text, no plus sign', () => {
    expect(phoneCell('+919876543210')).toBe('98765 43210');
  });

  it('groups other numbers and leaves empty ones empty', () => {
    expect(phoneCell('+14155550100')).toBe('141 5555 0100');
    expect(phoneCell(null)).toBeNull();
  });
});
