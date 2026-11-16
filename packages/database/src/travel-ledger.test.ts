import { payableApprovedPosting } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { reversePayableApproved } from './ledger/payable-postings';

/**
 * A database double for the reversal: selects answer in order (the approval entry, its
 * lines, the "posted already?" look), and the lines written by the reversing entry are kept.
 */
function ledgerDb(
  original: { debitPaise: number; creditPaise: number; account: string }[],
  posted: boolean,
) {
  const answers: unknown[][] = [
    [{ id: 'je-1', number: 7, projectId: null }],
    original.map((line) => ({ ...line })),
    posted ? [{ id: 'je-2' }] : [],
  ];
  const written: { entry?: Record<string, unknown>; lines?: Record<string, unknown>[] } = {};
  const link = (rows: unknown[]): unknown =>
    new Proxy(
      {},
      {
        get: (_, key) =>
          key === 'then' ? (resolve: (v: unknown[]) => void) => resolve(rows) : () => link(rows),
      },
    );
  let inserts = 0;
  const db = {
    select: () => link(answers.shift() ?? []),
    insert: () => ({
      values: (value: never) => {
        inserts += 1;
        if (inserts === 1) {
          written.entry = value;
          return link([{ id: 'je-2' }]);
        }
        written.lines = value;
        return link([]);
      },
    }),
  };
  return { db: db as never, written };
}

const net = (lines: { account: string; debitPaise: number; creditPaise: number }[]) => {
  const byAccount = new Map<string, number>();
  for (const line of lines)
    byAccount.set(
      line.account,
      (byAccount.get(line.account) ?? 0) + line.debitPaise - line.creditPaise,
    );
  return byAccount;
};

describe('voiding an approved travel bill reverses its ledger entry (S9)', () => {
  const approved = payableApprovedPosting({ party: 'employee', amountPaise: 8400 });

  it('posts an equal and opposite entry that points at the original', async () => {
    const { db, written } = ledgerDb(approved, false);
    const id = await reversePayableApproved(db, 'bill-1', 'boss', 'Travel claim voided: wrong day');
    expect(id).toBe('je-2');
    expect(written.entry).toMatchObject({
      sourceType: 'reversal',
      sourceId: 'je-1',
      reversesEntryId: 'je-1',
      postedByUserId: 'boss',
    });
    expect(String(written.entry?.memo)).toContain('wrong day');
  });

  it('leaves every account at zero once approved and voided', async () => {
    const { db, written } = ledgerDb(approved, false);
    await reversePayableApproved(db, 'bill-1', 'boss', 'void');
    const reversal = (written.lines ?? []).map((line) => ({
      account: String(line.accountCode),
      debitPaise: Number(line.debitPaise),
      creditPaise: Number(line.creditPaise),
    }));
    // Travel cost (5050) and what is owed to employees (2030): each nets to zero.
    const total = net([...approved, ...reversal]);
    expect([...total.keys()].sort()).toEqual(['2030', '5050']);
    expect([...total.values()]).toEqual([0, 0]);
    // The original is never touched or deleted: the reversal is a second entry.
    expect(reversal).toHaveLength(approved.length);
  });

  it('does nothing twice: a repeat posts no second reversal', async () => {
    const { db, written } = ledgerDb(approved, true);
    expect(await reversePayableApproved(db, 'bill-1', 'boss', 'void')).toBeNull();
    expect(written.entry).toBeUndefined();
  });

  it('has nothing to reverse for a bill that was never booked', async () => {
    const link: unknown = new Proxy(
      {},
      { get: (_, k) => (k === 'then' ? (r: (v: unknown[]) => void) => r([]) : () => link) },
    );
    const db = { select: () => link } as never;
    expect(await reversePayableApproved(db, 'bill-x', null, 'void')).toBeNull();
  });
});
