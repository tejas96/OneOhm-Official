/** One report as a sheet: a file name, column headers and rows of plain values. */
export interface CsvTable {
  readonly fileName: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly (string | number | null)[])[];
}

/** A value that starts like a formula could run in a spreadsheet, so it is quoted as text. */
const FORMULA = /^[=+\-@\t\r]/;

function cell(value: string | number | null): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  const safe = FORMULA.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** RFC 4180 CSV with a byte-order mark, so Excel reads rupees and Marathi names right. */
export function encodeCsv(table: CsvTable): string {
  const lines = [table.headers, ...table.rows].map((row) => row.map(cell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Paise as rupees with two decimals, for spreadsheets. */
export const rupees = (paise: number) => Math.round(paise) / 100;

/** A 0–1 rate as a whole percent, or blank. */
export const percent = (rate: number | null) => (rate === null ? null : Math.round(rate * 100));
