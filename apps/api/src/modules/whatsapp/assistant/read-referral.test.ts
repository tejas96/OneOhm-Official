import { describe, expect, it } from 'vitest';
import { readReferral } from './read-referral';

describe('assistant reading', () => {
  it('reads a name and mobile number', () => {
    expect(readReferral('Suresh Patil 98765 43210')).toEqual({
      name: 'Suresh Patil',
      phone: '+919876543210',
    });
    expect(readReferral('+91 9876543210 Asha')).toEqual({ name: 'Asha', phone: '+919876543210' });
    expect(readReferral('just a name')).toBeNull();
  });
});
