import { describe, expect, it } from 'vitest';
import { paperName } from './paper-name';

const photo = { name: 'IMG_2041.JPG', type: 'image/jpeg' };

describe('paperName', () => {
  it('names a photographed paper for what it is and the day', () => {
    expect(paperName('Electricity bill', '2026-11-01', photo, 0, 1)).toBe(
      'Electricity bill 2026-11-01.jpg',
    );
  });

  it('numbers several photos taken at once', () => {
    expect(paperName('ID proof', '2026-11-01', photo, 1, 2)).toBe('ID proof 2026-11-01 (2).jpg');
  });

  it('takes the extension from the type when the name has none', () => {
    expect(paperName('Other', '2026-11-01', { name: 'blob', type: 'image/png' }, 0, 1)).toBe(
      'Other 2026-11-01.png',
    );
  });

  it('keeps a picked PDF’s own name', () => {
    const pdf = { name: 'Bill Oct 2026.pdf', type: 'application/pdf' };
    expect(paperName('Electricity bill', '2026-11-01', pdf, 0, 1)).toBe('Bill Oct 2026.pdf');
  });
});
