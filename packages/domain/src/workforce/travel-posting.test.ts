import { describe, expect, it } from 'vitest';
import { isBalanced } from '../finance';
import { payableApprovedPosting, payablePaidPosting } from '../finance/ledger-postings';

describe('travel reimbursement in the ledger', () => {
  it('books an approved claim as travel cost owed to the employee', () => {
    const lines = payableApprovedPosting({ party: 'employee', amountPaise: 6173 });
    expect(lines).toEqual([
      { account: '5050', debitPaise: 6173, creditPaise: 0 },
      { account: '2030', debitPaise: 0, creditPaise: 6173 },
    ]);
    expect(isBalanced(lines)).toBe(true);
  });

  it('clears what is owed from the bank or cash when it is paid', () => {
    const upi = payablePaidPosting({ party: 'employee', method: 'upi', amountPaise: 6173 });
    expect(upi).toEqual([
      { account: '2030', debitPaise: 6173, creditPaise: 0 },
      { account: '1000', debitPaise: 0, creditPaise: 6173 },
    ]);
    const cash = payablePaidPosting({ party: 'employee', method: 'cash', amountPaise: 6173 });
    expect(cash[1]?.account).toBe('1010');
    expect(isBalanced(cash)).toBe(true);
  });

  it('leaves vendor and crew bills where they were', () => {
    expect(payableApprovedPosting({ party: 'vendor', amountPaise: 100 })[0]?.account).toBe('5000');
    expect(payableApprovedPosting({ party: 'contractor', amountPaise: 100 })[1]?.account).toBe(
      '2010',
    );
  });
});
