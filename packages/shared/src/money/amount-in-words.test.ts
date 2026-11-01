import { describe, expect, it } from 'vitest';
import { amountInWords } from './amount-in-words';

describe('amountInWords', () => {
  it('uses lakh and crore', () => {
    expect(amountInWords(12_505_050)).toBe(
      'Rupees One Lakh Twenty-Five Thousand Fifty and Fifty Paise Only',
    );
    expect(amountInWords(2_35_00_000_00)).toBe('Rupees Two Crore Thirty-Five Lakh Only');
  });

  it('handles small and zero amounts', () => {
    expect(amountInWords(0)).toBe('Rupees Zero Only');
    expect(amountInWords(1_10_000)).toBe('Rupees One Thousand One Hundred Only');
    expect(amountInWords(5)).toBe('Rupees Zero and Five Paise Only');
  });
});
