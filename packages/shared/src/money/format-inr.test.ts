import { describe, expect, it } from 'vitest';
import { formatInr, formatInrCompact, rupeesToPaise } from './format-inr';

describe('formatInr', () => {
  it('groups in lakhs and drops zero paise', () => {
    expect(formatInr(rupeesToPaise(1_840_000))).toBe('₹18,40,000');
  });

  it('keeps paise when there are some', () => {
    expect(formatInr(125_050)).toBe('₹1,250.50');
  });
});

describe('formatInrCompact', () => {
  it('uses lakhs and crores', () => {
    expect(formatInrCompact(rupeesToPaise(1_840_000))).toBe('₹18.4 L');
    expect(formatInrCompact(rupeesToPaise(23_500_000))).toBe('₹2.35 Cr');
    expect(formatInrCompact(rupeesToPaise(3_000_000))).toBe('₹30 L');
  });

  it('keeps small amounts whole', () => {
    expect(formatInrCompact(rupeesToPaise(8_500))).toBe('₹8,500');
  });
});
