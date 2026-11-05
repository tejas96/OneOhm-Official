import { describe, expect, it } from 'vitest';
import { lastFour, paidMessageValues, sayDay } from './payee-message';

describe('payee message values', () => {
  it('says the day and the last four digits in plain words', () => {
    expect(sayDay('2026-11-05')).toBe('5 Nov 2026');
    expect(lastFour('•••• 1234')).toBe('1234');
  });

  it('fills every detail of the template and never carries a full account number', () => {
    const values = paidMessageValues({
      payeeName: 'Shree Electricals',
      amountPaise: 1_250_000,
      company: 'OneOhm Solar',
      utr: 'UTR123',
      paidOn: '2026-11-05',
      accountMasked: '•••• 4321',
    });
    expect(values).toEqual({
      payee: 'Shree Electricals',
      amount: expect.stringContaining('12,500'),
      company: 'OneOhm Solar',
      utr: 'UTR123',
      date: '5 Nov 2026',
      last4: '4321',
    });
  });

  it('does not leave the UTR blank when the bank has not given one', () => {
    const values = paidMessageValues({
      payeeName: 'A',
      amountPaise: 100,
      company: 'C',
      utr: null,
      paidOn: '2026-11-05',
      accountMasked: '•••• 1',
    });
    expect(values.utr).toBe('not given yet');
  });
});
