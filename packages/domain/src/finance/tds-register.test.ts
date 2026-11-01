import { describe, expect, it } from 'vitest';
import { ACCOUNT } from './ledger-accounts';
import { contractorTdsPosting, isBalanced, payableApprovedPosting } from './ledger-postings';
import {
  tdsDepositPosting,
  tdsDepositProblem,
  tdsDueOn,
  tdsMonthOf,
  tdsMonthRows,
  tdsRateFor,
  tdsSectionOf,
} from './tds-register';

describe('TDS section', () => {
  it('puts crew and contractor work under 194C', () => {
    expect(tdsSectionOf({ source: 'work_order', party: 'contractor' })).toBe('194C');
    expect(tdsSectionOf({ source: 'bill', party: 'contractor' })).toBe('194C');
  });

  it('puts goods bills under 194Q and other vendor bills under 194J', () => {
    expect(tdsSectionOf({ source: 'receipt_bill', party: 'vendor' })).toBe('194Q');
    expect(tdsSectionOf({ source: 'bill', party: 'vendor' })).toBe('194J');
  });
});

describe('TDS due date', () => {
  it('is the 7th of the next month', () => {
    expect(tdsDueOn('2026-10')).toBe('2026-11-07');
    expect(tdsDueOn('2026-12')).toBe('2027-01-07');
  });

  it('is 30 April for March', () => {
    expect(tdsDueOn('2027-03')).toBe('2027-04-30');
  });

  it('reads the month from a date', () => {
    expect(tdsMonthOf('2026-10-31')).toBe('2026-10');
  });
});

describe('TDS by month and section', () => {
  const held = [
    { month: '2026-10', section: '194C', amountPaise: 1_000_00 },
    { month: '2026-10', section: '194C', amountPaise: 500_00 },
    { month: '2026-10', section: '194J', amountPaise: 200_00 },
    { month: '2026-09', section: '194C', amountPaise: 300_00 },
  ] as const;

  it('adds up what was held and what is still due', () => {
    const rows = tdsMonthRows(held, [], '2026-11-01');
    expect(rows.map((row) => [row.month, row.section, row.heldPaise, row.duePaise])).toEqual([
      ['2026-10', '194C', 1_500_00, 1_500_00],
      ['2026-10', '194J', 200_00, 200_00],
      ['2026-09', '194C', 300_00, 300_00],
    ]);
  });

  it('says overdue after the 7th and deposited once paid in full', () => {
    const rows = tdsMonthRows(
      held,
      [{ month: '2026-10', section: '194C', amountPaise: 1_500_00 }],
      '2026-11-08',
    );
    expect(rows.map((row) => row.state)).toEqual(['deposited', 'overdue', 'overdue']);
  });

  it('keeps a part deposit due for the rest', () => {
    const [row] = tdsMonthRows(
      [{ month: '2026-10', section: '194C', amountPaise: 1_500_00 }],
      [{ month: '2026-10', section: '194C', amountPaise: 1_000_00 }],
      '2026-11-01',
    );
    expect(row).toMatchObject({ depositedPaise: 1_000_00, duePaise: 500_00, state: 'due' });
  });
});

describe('TDS deposit', () => {
  const base = { month: '2026-10', duePaise: 1_500_00, today: '2026-11-05' };

  it('needs TDS due and a challan date from the month on, not in the future', () => {
    expect(tdsDepositProblem({ ...base, depositedOn: '2026-11-05' })).toBeNull();
    expect(tdsDepositProblem({ ...base, depositedOn: '2026-10-31' })).toBeNull();
    expect(tdsDepositProblem({ ...base, duePaise: 0, depositedOn: '2026-11-05' })).toBe(
      'nothing_due',
    );
    expect(tdsDepositProblem({ ...base, depositedOn: '2026-11-06' })).toBe('in_future');
    expect(tdsDepositProblem({ ...base, depositedOn: '2026-09-30' })).toBe('before_month');
  });

  it('books TDS payable against the bank, balanced', () => {
    const lines = tdsDepositPosting({ amountPaise: 1_500_00 });
    expect(isBalanced(lines)).toBe(true);
    expect(lines).toEqual([
      { account: ACCOUNT.tdsPayable, debitPaise: 1_500_00, creditPaise: 0 },
      { account: ACCOUNT.bank, debitPaise: 0, creditPaise: 1_500_00 },
    ]);
  });

  it('clears TDS payable to zero after holding and depositing it', () => {
    const entries = [
      payableApprovedPosting({ party: 'vendor', amountPaise: 10_000_00, tdsPaise: 200_00 }),
      contractorTdsPosting({ amountPaise: 1_300_00 }),
      tdsDepositPosting({ amountPaise: 1_500_00 }),
    ];
    const lines = entries.flat();
    const net = (account: string) =>
      lines
        .filter((line) => line.account === account)
        .reduce((sum, line) => sum + line.creditPaise - line.debitPaise, 0);
    expect(net(ACCOUNT.tdsPayable)).toBe(0);
    const debits = lines.reduce((sum, line) => sum + line.debitPaise, 0);
    const credits = lines.reduce((sum, line) => sum + line.creditPaise, 0);
    expect(debits).toBe(credits);
  });
});

describe('TDS rate to use', () => {
  it('takes the first rate that is set, zero included', () => {
    expect(tdsRateFor(null, 200, 100)).toBe(200);
    expect(tdsRateFor(undefined, null, 100)).toBe(100);
    expect(tdsRateFor(0, 200)).toBe(0);
    expect(tdsRateFor(null, null)).toBe(0);
  });
});
