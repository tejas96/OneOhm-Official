import { beforeEach, describe, expect, it, vi } from 'vitest';

const lib = vi.hoisted(() => ({
  notify: vi.fn(),
  notifyHolders: vi.fn(),
  postPayableApproved: vi.fn(),
}));
vi.mock('./notify', () => lib);
vi.mock('./ledger/payable-postings', () => ({ postPayableApproved: lib.postPayableApproved }));

import { payables } from './schema/finance.schema';
import { auditLog } from './schema/records.schema';
import { travelClaims } from './schema/site-activity.schema';
import { approveTravelClaim, type TravelClaimRow } from './travel-claim-approve';
import { scriptedTx } from './travel-claim-test-kit';

const row = {
  id: 'c1',
  userId: 'worker',
  workDate: '2026-11-14',
  distanceM: 12_000,
  ratePaisePerKm: 700,
  amountPaise: 8400,
  projectId: 'p1',
} as TravelClaimRow;

const run = (approver: { userId: string | null; note?: string }) => {
  const kit = scriptedTx([[{ fullName: 'Ravi' }]], { payables: [[{ id: 'pay1' }]] });
  return { ...kit, result: approveTravelClaim(kit.tx, row, approver) };
};

beforeEach(() => vi.clearAllMocks());

describe('approving a travel claim', () => {
  it('makes an employee payable, books it, and approves the claim', async () => {
    const { inserts, updates, result } = run({ userId: 'boss', note: ' ok ' });
    expect(await result).toBe('pay1');
    expect(inserts.find((i) => i.table === payables)?.values).toMatchObject({
      party: 'employee',
      partyUserId: 'worker',
      amountPaise: 8400,
      approvedByUserId: 'boss',
    });
    expect(lib.postPayableApproved).toHaveBeenCalledWith(expect.anything(), 'pay1', 'boss');
    expect(updates.find((u) => u.table === travelClaims)?.set).toMatchObject({
      status: 'approved',
      decidedByUserId: 'boss',
      decisionNote: 'ok',
      payableId: 'pay1',
      autoApproved: false,
    });
  });

  it('tells the worker and finance, and audits it', async () => {
    const { inserts, result } = run({ userId: 'boss' });
    await result;
    expect(lib.notify).toHaveBeenCalledWith(
      expect.anything(),
      { userId: 'worker' },
      expect.objectContaining({ kind: 'travel_claim_decided' }),
    );
    expect(lib.notifyHolders).toHaveBeenCalledWith(
      expect.anything(),
      'finance.record_payments',
      expect.objectContaining({
        kind: 'travel_payable_ready',
        subject: { type: 'payable', id: 'pay1', projectId: 'p1' },
      }),
      'boss',
    );
    expect(inserts.find((i) => i.table === auditLog)?.values).toMatchObject({
      action: 'travel_claim.approved',
      actorUserId: 'boss',
    });
  });

  it('as the system: no user anywhere, flagged auto approved', async () => {
    const { inserts, updates, result } = run({
      userId: null,
      note: 'Approved automatically: clean day',
    });
    await result;
    expect(inserts.find((i) => i.table === payables)?.values).toMatchObject({
      approvedByUserId: null,
    });
    expect(lib.postPayableApproved).toHaveBeenCalledWith(expect.anything(), 'pay1', null);
    expect(updates.find((u) => u.table === travelClaims)?.set).toMatchObject({
      status: 'approved',
      decidedByUserId: null,
      decisionNote: 'Approved automatically: clean day',
      autoApproved: true,
    });
    expect(lib.notifyHolders).toHaveBeenCalledWith(
      expect.anything(),
      'finance.record_payments',
      expect.anything(),
      null,
    );
  });
});
