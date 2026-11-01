import { describe, expect, it } from 'vitest';
import { milestoneDueNotice } from './milestone-due-notice';

const due = {
  payer: 'customer' as const,
  amountPaise: 65_000_00,
  paidPaise: 0,
  final: false,
  onlinePayments: true,
};

describe('milestoneDueNotice', () => {
  it('sends the amount with a pay link when online payments are on', () => {
    expect(milestoneDueNotice(due)).toEqual({
      send: true,
      message: 'payment_link',
      owedPaise: 65_000_00,
    });
  });

  it('says only what is due when online payments are off, final payment included', () => {
    expect(milestoneDueNotice({ ...due, onlinePayments: false, final: true })).toEqual({
      send: true,
      message: 'payment_reminder',
      owedPaise: 65_000_00,
    });
  });

  it('asks only for the balance of an advance already part paid', () => {
    expect(milestoneDueNotice({ ...due, paidPaise: 15_000_00 })).toMatchObject({
      owedPaise: 50_000_00,
    });
  });

  it('never asks the customer for the bank share or for what is paid', () => {
    expect(milestoneDueNotice({ ...due, payer: 'bank' })).toEqual({
      send: false,
      reason: 'bank_share',
    });
    expect(milestoneDueNotice({ ...due, paidPaise: 65_000_00 })).toEqual({
      send: false,
      reason: 'paid',
    });
  });

  it('leaves the final payment link to its own sender, so the customer hears once', () => {
    expect(milestoneDueNotice({ ...due, final: true })).toEqual({
      send: false,
      reason: 'final_link_follows',
    });
  });
});
