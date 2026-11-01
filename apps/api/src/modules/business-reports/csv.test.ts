import { describe, expect, it } from 'vitest';
import { encodeCsv, percent, rupees } from './csv';

describe('encodeCsv', () => {
  it('quotes commas and quotes, and neutralises formulas', () => {
    const text = encodeCsv({
      fileName: 'x',
      headers: ['Name', 'Note'],
      rows: [
        ['Patil, Ramesh', 'said "ok"'],
        ['=SUM(A1)', null],
      ],
    });
    expect(text).toBe('﻿Name,Note\r\n"Patil, Ramesh","said ""ok"""\r\n\'=SUM(A1),\r\n');
  });

  it('writes money in rupees and rates in percent', () => {
    expect(rupees(123456)).toBe(1234.56);
    expect(percent(0.756)).toBe(76);
    expect(percent(null)).toBeNull();
  });
});
