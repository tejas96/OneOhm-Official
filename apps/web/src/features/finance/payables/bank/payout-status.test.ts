import type { BankPayout } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/api-error';
import {
  billStatus,
  latestByBill,
  lowBalanceBanner,
  payoutIsOpen,
  sameName,
  sendErrorLine,
} from './payout-status';

const payout = (phase: BankPayout['phase'], payableId = 'b1'): BankPayout =>
  ({ phase, payableId }) as BankPayout;

describe('billStatus', () => {
  const approved = { status: 'approved', paidPaise: 0 } as const;
  it('shows one status per bill', () => {
    expect(billStatus({ status: 'pending', paidPaise: 0 })).toBe('pending');
    expect(billStatus(approved)).toBe('toPay');
    expect(billStatus({ status: 'approved', paidPaise: 500 })).toBe('partPaid');
    expect(billStatus({ status: 'paid', paidPaise: 900 }, payout('came_back'))).toBe('paid');
  });
  it('follows the newest bank transfer', () => {
    expect(billStatus(approved, payout('sending'))).toBe('sending');
    expect(billStatus(approved, payout('on_its_way'))).toBe('sending');
    expect(billStatus(approved, payout('came_back'))).toBe('cameBack');
    expect(billStatus(approved, payout('failed'))).toBe('failed');
    expect(billStatus({ status: 'approved', paidPaise: 500 }, payout('paid'))).toBe('partPaid');
  });
});

describe('billStatus with a closed practice transfer', () => {
  const closed = { phase: 'failed', failureCode: 'practice_closed', payableId: 'b1' } as BankPayout;
  it('does not show Failed', () => {
    expect(billStatus({ status: 'approved', paidPaise: 0 }, closed)).toBe('toPay');
    expect(billStatus({ status: 'approved', paidPaise: 500 }, closed)).toBe('partPaid');
  });
});

describe('helpers', () => {
  it('knows an open transfer', () => {
    expect(payoutIsOpen(payout('on_its_way'))).toBe(true);
    expect(payoutIsOpen(payout('paid'))).toBe(false);
    expect(payoutIsOpen(null)).toBe(false);
  });
  it('keeps the newest payout of each bill', () => {
    const map = latestByBill([payout('failed', 'a'), payout('paid', 'a'), payout('sending', 'b')]);
    expect(map.get('a')?.phase).toBe('failed');
    expect(map.get('b')?.phase).toBe('sending');
  });
  it('shows the low balance banner until a later good payout', () => {
    expect(lowBalanceBanner(undefined)).toBe(false);
    expect(lowBalanceBanner({ lastLowBalanceAt: null, lastGoodPayoutAt: null })).toBe(false);
    expect(
      lowBalanceBanner({ lastLowBalanceAt: '2026-11-05T10:00:00Z', lastGoodPayoutAt: null }),
    ).toBe(true);
    expect(
      lowBalanceBanner({
        lastLowBalanceAt: '2026-11-05T10:00:00Z',
        lastGoodPayoutAt: '2026-11-05T11:00:00Z',
      }),
    ).toBe(false);
    expect(
      lowBalanceBanner({
        lastLowBalanceAt: '2026-11-05T12:00:00Z',
        lastGoodPayoutAt: '2026-11-05T11:00:00Z',
      }),
    ).toBe(true);
  });
  it('compares names loosely', () => {
    expect(sameName(' Sun  Power ', 'sun power')).toBe(true);
    expect(sameName('Sun Power Pvt Ltd', 'Sun Power')).toBe(false);
    expect(sameName(null, 'Sun Power')).toBe(false);
  });
});

describe('sendErrorLine', () => {
  const err = (code: string) => new ApiError(409, 'Not enough money.', code, {});
  it('shows the line once', () => {
    expect(sendErrorLine(err('low_balance'), null)).toBeNull();
    expect(sendErrorLine(err('other'), { lowBalance: true } as BankPayout)).toBeNull();
    expect(sendErrorLine(err('payout_failed'), payout('failed'))).toBeNull();
  });
  it('keeps errors nothing else explains', () => {
    expect(sendErrorLine(err('payout_failed'), payout('paid'))).toBe('Not enough money.');
    expect(sendErrorLine(err('bank_on_hold'), null)).toBe('Not enough money.');
    expect(sendErrorLine(null, null)).toBeNull();
  });
});
