import { describe, expect, it } from 'vitest';
import { cleanNumberText, readNumberText, toText } from './number-text';

const paise = (raw: string) => readNumberText(raw, 'paise');

describe('number text', () => {
  it('drops letters and minus signs, never negative or NaN', () => {
    expect(paise('abc')).toEqual({ text: '', value: null });
    expect(paise('-500')).toEqual({ text: '500', value: 50_000 });
    expect(paise('1e5')).toEqual({ text: '15', value: 1_500 });
    expect(paise('0x10').value).toBe(1_000);
    expect(paise('Infinity').value).toBeNull();
  });

  it('keeps at most two decimals for paise: no fraction of a paisa', () => {
    expect(paise('12.345')).toEqual({ text: '12.34', value: 1_234 });
    expect(paise('0.29').value).toBe(29);
    expect(Number.isInteger(paise('1.005').value)).toBe(true);
  });

  it('reads pasted rupee text with Indian commas, symbols and spaces', () => {
    expect(paise('₹1,000.50')).toEqual({ text: '1000.50', value: 100_050 });
    expect(paise('1,00,000').value).toBe(1_00_000_00);
    expect(paise('Rs. 2,500').value).toBe(250_000);
    expect(paise('INR 2,500').value).toBe(250_000);
    expect(paise(' 1 000 ').value).toBe(100_000);
  });

  it('removes leading zeros', () => {
    expect(paise('007').text).toBe('7');
    expect(paise('000').text).toBe('0');
    expect(paise('00.5').text).toBe('0.5');
    expect(paise('.5')).toEqual({ text: '0.5', value: 50 });
  });

  it('stops very large numbers short of unsafe integers', () => {
    const big = paise('9'.repeat(40));
    expect(big.text).toHaveLength(12);
    expect(Number.isSafeInteger(big.value)).toBe(true);
  });

  it('keeps partial typing and treats a lone point as empty', () => {
    expect(paise('12.')).toEqual({ text: '12.', value: 1_200 });
    expect(paise('.')).toEqual({ text: '.', value: null });
    expect(paise('')).toEqual({ text: '', value: null });
  });

  it('follows each unit', () => {
    expect(readNumberText('18.5%', 'basisPoints')).toEqual({ text: '18.5', value: 1_850 });
    expect(readNumberText('3.5', 'whole')).toEqual({ text: '3', value: 3 });
    expect(readNumberText('2.125', 'watts').value).toBe(2_125);
    expect(readNumberText('115.5', 'decimal').value).toBe(115.5);
    expect(cleanNumberText('1,2,3', 'whole')).toBe('123');
  });

  it('shows stored values back as typed', () => {
    expect(toText(100_050, 'paise')).toBe('1000.5');
    expect(toText(null, 'paise')).toBe('');
    expect(toText(1_850, 'basisPoints')).toBe('18.5');
  });
});
