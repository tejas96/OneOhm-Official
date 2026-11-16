import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => ({ tellTravelPaid: vi.fn() }));
vi.mock('../travel-notices', () => sent);
vi.mock('./payable-payment-postings', () => ({
  postPayablePayment: vi.fn(),
  reversePayablePaymentEntry: vi.fn(),
}));

import { recordPayablePayment } from './payable-payments';

/** Selects answer in order: lock, lock again, sum of payments, latest payment. */
function dbWith(billStatus: string, amountPaise: number, paidSoFar: number) {
  const bill = {
    id: 'b1',
    status: billStatus,
    amountPaise,
    tdsPaise: 0,
    advanceAdjustedPaise: 0,
    paidPaise: 0,
  };
  const answers: unknown[][] = [
    [bill],
    [bill],
    [{ sum: String(paidSoFar) }],
    [{ paidOn: '2026-11-15', method: 'upi', reference: null, paidByUserId: 'fin' }],
  ];
  const link = (rows: unknown[]): unknown =>
    new Proxy(
      {},
      {
        get: (_, key) =>
          key === 'then' ? (resolve: (v: unknown[]) => void) => resolve(rows) : () => link(rows),
      },
    );
  return {
    select: () => link(answers.shift() ?? []),
    insert: () => ({ values: () => link([{ id: 'pay-1' }]) }),
    update: () => ({ set: () => link([]) }),
  } as never;
}
const pay = (db: never) =>
  recordPayablePayment(db, {
    payableId: 'b1',
    amountPaise: 8400,
    method: 'upi',
    paidOn: '2026-11-15',
    reference: null,
    userId: 'fin',
  });

beforeEach(() => vi.clearAllMocks());

describe('travel money paid (S8)', () => {
  it('tells the worker when the payment makes the bill paid, by hand or by bank', async () => {
    const done = await pay(dbWith('approved', 8400, 8400));
    expect(done?.billStatus).toBe('paid');
    expect(sent.tellTravelPaid).toHaveBeenCalledWith(expect.anything(), 'b1');
  });

  it('says nothing for a part payment', async () => {
    const done = await pay(dbWith('approved', 8400, 4000));
    expect(done?.billStatus).toBeNull();
    expect(sent.tellTravelPaid).not.toHaveBeenCalled();
  });
});
