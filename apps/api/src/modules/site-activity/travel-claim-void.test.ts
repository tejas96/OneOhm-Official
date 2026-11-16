import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { payables, payoutRequests, travelClaims } from '@oneohm/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  reversePayableApproved: vi.fn(async () => 'rev-1'),
  notify: vi.fn(),
  notifyHolders: vi.fn(),
}));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const people = vi.hoisted(() => ({ assertMayVoidClaim: vi.fn() }));

vi.mock('@oneohm/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@oneohm/database')>()),
  ...db,
}));
vi.mock('../../common/audit', () => audit);
vi.mock('./travel-claim-people', () => people);

import { actor } from './site-visit-test-kit';
import { voidClaim } from './travel-claim-void';
import { scripted } from './travel-test-kit';

const approver = actor('boss');
const claim = (patch: object = {}) => ({
  id: 'c1',
  userId: 'worker',
  workDate: '2026-11-14',
  amountPaise: 8400,
  projectId: 'p1',
  status: 'approved',
  payableId: 'b1',
  ...patch,
});
const bill = (patch: object = {}) => ({
  id: 'b1',
  status: 'approved',
  partyName: 'Ravi',
  paidPaise: 0,
  ...patch,
});

/** Runs the void with the rows the transaction will read: the claim, its bill, an open transfer. */
function run(
  rows: { claim?: object | null; bill?: object | null; open?: boolean },
  reason = 'Wrong day',
) {
  const { tx, updates } = scripted([
    rows.claim === null ? [] : [rows.claim ?? claim()],
    rows.bill === null ? [] : [rows.bill ?? bill()],
    rows.open ? [{ id: 'payout-1' }] : [],
  ]);
  return { updates, result: voidClaim(tx as never, approver, 'c1', reason) };
}

beforeEach(() => vi.clearAllMocks());

describe('voiding an approved claim (S9)', () => {
  it('cancels the bill, reverses its ledger entry and cancels the claim with the reason', async () => {
    const { updates, result } = run({});
    await result;
    expect(updates.find((u) => u.table === payables)?.set).toMatchObject({ status: 'cancelled' });
    // An equal and opposite entry on the bill's own approval posting, never a deletion.
    expect(db.reversePayableApproved).toHaveBeenCalledWith(
      expect.anything(),
      'b1',
      'boss',
      expect.stringContaining('Wrong day'),
    );
    expect(updates.find((u) => u.table === travelClaims)?.set).toMatchObject({
      status: 'cancelled',
      voidReason: 'Wrong day',
      voidedByUserId: 'boss',
    });
  });

  it('tells the worker (with the reason) and finance, and writes the audit', async () => {
    await run({}).result;
    expect(db.notify).toHaveBeenCalledWith(
      expect.anything(),
      { userId: 'worker' },
      expect.objectContaining({
        kind: 'travel_claim_voided',
        body: expect.stringContaining('Wrong day'),
        subject: { type: 'travel_claim', id: 'c1' },
      }),
    );
    expect(db.notifyHolders).toHaveBeenCalledWith(
      expect.anything(),
      'finance.record_payments',
      expect.objectContaining({
        kind: 'travel_payable_voided',
        subject: { type: 'payable', id: 'b1', projectId: 'p1' },
      }),
      'boss',
    );
    expect(audit.recordAudit).toHaveBeenCalledWith(
      expect.anything(),
      'boss',
      'travel_claim.voided',
      'travel_claim',
      'c1',
      expect.objectContaining({ reason: 'Wrong day', payableId: 'b1', ledgerReversed: true }),
    );
  });

  it('needs a reason', async () => {
    const { updates, result } = run({}, '   ');
    await expect(result).rejects.toMatchObject({ status: 400 });
    expect(updates).toHaveLength(0);
  });

  it('refuses a claim that is still waiting or already cancelled', async () => {
    for (const status of ['pending', 'rejected', 'cancelled']) {
      const { updates, result } = run({ claim: claim({ status }) });
      await expect(result).rejects.toMatchObject({ status: 409, code: 'not_approved' });
      expect(updates).toHaveLength(0);
    }
  });

  it('refuses once the bill is paid, and when part of it was paid', async () => {
    const paid = run({ bill: bill({ status: 'paid', paidPaise: 8400 }) });
    await expect(paid.result).rejects.toMatchObject({ status: 409, code: 'paid' });
    const part = run({ bill: bill({ paidPaise: 1000 }) });
    await expect(part.result).rejects.toMatchObject({ status: 409, code: 'paid' });
    expect(paid.updates).toHaveLength(0);
    expect(part.updates).toHaveLength(0);
    expect(db.reversePayableApproved).not.toHaveBeenCalled();
  });

  it('refuses while a bank transfer is on its way', async () => {
    const { updates, result } = run({ open: true });
    await expect(result).rejects.toMatchObject({ status: 409, code: 'payout_open' });
    expect(updates).toHaveLength(0);
    expect(db.reversePayableApproved).not.toHaveBeenCalled();
  });

  it('closes any open ask to send the bill, in the same transaction', async () => {
    const { updates, result } = run({});
    await result;
    expect(updates.find((u) => u.table === payoutRequests)?.set).toMatchObject({
      status: 'declined',
      decidedByUserId: 'boss',
    });
  });

  it('counts any transfer that did not fail as blocking, paid or on its way', () => {
    const source = readFileSync(join(__dirname, 'travel-claim-void.ts'), 'utf8');
    expect(source).toMatch(/notInArray\(bankPayouts\.status, \[\.\.\.PAYOUT_FAILED_STATUSES\]\)/);
    // The bill row is locked before the transfers are read, as the sender locks it.
    expect(source.indexOf(".for('update')", source.indexOf('payables'))).toBeLessThan(
      source.indexOf('bankPayouts.payableId'),
    );
  });

  it('refuses someone who may not void the claim, before touching anything', async () => {
    people.assertMayVoidClaim.mockImplementationOnce(() => {
      throw Object.assign(new Error('no'), { status: 403 });
    });
    const { updates, result } = run({});
    await expect(result).rejects.toMatchObject({ status: 403 });
    expect(updates).toHaveLength(0);
  });

  it('answers 404 for a claim that is not there', async () => {
    await expect(run({ claim: null }).result).rejects.toMatchObject({ status: 404 });
  });
});
