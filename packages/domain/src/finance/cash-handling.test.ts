import { describe, expect, it } from 'vitest';
import {
  canDeposit,
  canSettleCheque,
  cashDepositPosting,
  chequeClearedPosting,
  daysHeld,
  depositNumber,
  moneyAccountNow,
} from './cash-handling';
import { ACCOUNT } from './ledger-accounts';
import { paymentPosting } from './ledger-postings';

const balanced = (lines: readonly { debitPaise: number; creditPaise: number }[]) =>
  lines.reduce((sum, line) => sum + line.debitPaise - line.creditPaise, 0) === 0;

describe('cash and cheque handling (PRD 3.11)', () => {
  it('holds a cheque in "Cheques in hand" until it clears', () => {
    const lines = paymentPosting({
      payer: 'customer',
      method: 'cheque',
      amountPaise: 50_000_00,
      milestoneDue: true,
    });
    expect(lines[0]?.account).toBe(ACCOUNT.chequesInHand);
    const cleared = chequeClearedPosting(50_000_00);
    expect(balanced(cleared)).toBe(true);
    expect(cleared.map((line) => line.account)).toEqual([ACCOUNT.bank, ACCOUNT.chequesInHand]);
  });

  it('moves deposited cash from cash in hand to the bank', () => {
    const lines = cashDepositPosting(12_000_00);
    expect(balanced(lines)).toBe(true);
    expect(lines[0]).toMatchObject({ account: ACCOUNT.bank, debitPaise: 12_000_00 });
    expect(cashDepositPosting(0)).toEqual([]);
  });

  it('knows where the money sits for a correct reversal', () => {
    expect(moneyAccountNow('cash', 'in_hand')).toBe(ACCOUNT.cash);
    expect(moneyAccountNow('cash', 'deposited')).toBe(ACCOUNT.bank);
    expect(moneyAccountNow('cheque', 'deposited')).toBe(ACCOUNT.chequesInHand);
    expect(moneyAccountNow('cheque', 'cleared')).toBe(ACCOUNT.bank);
  });

  it('deposits only money in hand and settles only open cheques', () => {
    expect(canDeposit('in_hand')).toBe(true);
    expect(canDeposit('deposited')).toBe(false);
    expect(canSettleCheque('cheque', 'deposited')).toBe(true);
    expect(canSettleCheque('cheque', 'cleared')).toBe(false);
    expect(canSettleCheque('cash', 'in_hand')).toBe(false);
  });

  it('counts days held and numbers slips by financial year', () => {
    expect(daysHeld('2026-10-28', '2026-11-01')).toBe(4);
    expect(daysHeld('2026-11-02', '2026-11-01')).toBe(0);
    expect(depositNumber('2026-11-01', 3)).toBe('DEP/2026-27/0003');
    expect(depositNumber('2027-02-10', 12)).toBe('DEP/2026-27/0012');
    expect(depositNumber('2027-04-01', 1)).toBe('DEP/2027-28/0001');
  });
});
