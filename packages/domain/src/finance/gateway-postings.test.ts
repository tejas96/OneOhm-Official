import { describe, expect, it } from 'vitest';
import { ACCOUNT } from './ledger-accounts';
import {
  gatewayFeePosting,
  isBalanced,
  paymentPosting,
  settlementPosting,
} from './ledger-postings';

describe('online payments in the ledger', () => {
  it('leaves gateway clearing at zero once the gateway pays out', () => {
    const received = paymentPosting({
      payer: 'customer',
      method: 'razorpay',
      amountPaise: 100_000_00,
      milestoneDue: true,
    });
    const fee = gatewayFeePosting({ feePaise: 2_360_00 });
    const settled = settlementPosting({ amountPaise: 97_640_00 });
    for (const lines of [received, fee, settled]) expect(isBalanced(lines)).toBe(true);
    const clearing = [...received, ...fee, ...settled]
      .filter((line) => line.account === ACCOUNT.gateway)
      .reduce((sum, line) => sum + line.debitPaise - line.creditPaise, 0);
    expect(clearing).toBe(0);
  });

  it('books the fee as an expense', () => {
    expect(gatewayFeePosting({ feePaise: 500 })[0]).toMatchObject({
      account: ACCOUNT.gatewayFees,
      debitPaise: 500,
    });
  });
});
