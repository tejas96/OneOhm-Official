import { describe, expect, it } from 'vitest';
import { tidy } from './payout-details.service';

describe('payout details tidy', () => {
  it('uppercases only PAN and IFSC', () => {
    expect(tidy('pan', ' abcde1234f ')).toBe('ABCDE1234F');
    expect(tidy('bankIfsc', 'hdfc0000001')).toBe('HDFC0000001');
  });

  it('keeps the typed case of a UPI ID and account name, trimmed', () => {
    expect(tidy('upiId', ' Gone@okaxis ')).toBe('Gone@okaxis');
    expect(tidy('bankAccountName', ' Asha Kale ')).toBe('Asha Kale');
  });

  it('turns blank into null', () => {
    expect(tidy('upiId', '   ')).toBeNull();
    expect(tidy('pan', null)).toBeNull();
  });
});
