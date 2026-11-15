import { beforeEach, describe, expect, it, vi } from 'vitest';

const read = vi.hoisted(() => ({ travelDay: vi.fn(), readClaims: vi.fn() }));
const db = vi.hoisted(() => ({
  notify: vi.fn(),
  notifyHolders: vi.fn(),
  postPayableApproved: vi.fn(),
}));
const people = vi.hoisted(() => ({ assertMayDecideClaim: vi.fn() }));

vi.mock('./travel-read', () => read);
vi.mock('./travel-claim-people', () => people);
vi.mock('../workforce/policy', () => ({ loadPolicy: vi.fn(async () => ({})) }));
vi.mock('../../common/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('@oneohm/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@oneohm/database')>()),
  ...db,
}));

import { payables, travelClaims } from '@oneohm/database';
import { actor } from './site-visit-test-kit';
import { TravelClaimsService } from './travel-claims.service';
import { scripted } from './travel-test-kit';

const claim = (patch: object = {}) => ({
  id: 'c1',
  userId: 'worker',
  workDate: '2026-11-14',
  distanceM: 12_000,
  ratePaisePerKm: 700,
  amountPaise: 8400,
  projectId: 'p1',
  status: 'pending',
  ...patch,
});

function decide(approve: boolean, row: object | null = claim()) {
  const { tx, updates } = scripted(
    [row ? [row] : [], [{ fullName: 'Ravi' }], [{ name: 'Ravi' }]],
    [[{ id: 'pay1' }]],
  );
  read.readClaims.mockResolvedValue([{ id: 'c1' }]);
  const result = new TravelClaimsService(tx as never).decide(actor('boss'), 'c1', approve, 'ok');
  return { updates, result };
}

beforeEach(() => vi.clearAllMocks());

describe('deciding a travel claim (S8, S10)', () => {
  it('asks who may decide before anything is read or written', async () => {
    people.assertMayDecideClaim.mockRejectedValueOnce(
      Object.assign(new Error('no'), { status: 403 }),
    );
    const { updates, result } = decide(true);
    await expect(result).rejects.toMatchObject({ status: 403 });
    expect(updates).toHaveLength(0);
    expect(db.notify).not.toHaveBeenCalled();
    expect(people.assertMayDecideClaim).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'worker',
    );
  });

  it('approving makes an employee payable and books it', async () => {
    const { updates, result } = decide(true);
    await result;
    expect(db.postPayableApproved).toHaveBeenCalledWith(expect.anything(), 'pay1', 'boss');
    expect(updates.find((u) => u.table === travelClaims)?.set).toMatchObject({
      status: 'approved',
      payableId: 'pay1',
      decidedByUserId: 'boss',
    });
  });

  it('tells finance on approval, with an alert that opens the bill', async () => {
    await decide(true).result;
    expect(db.notifyHolders).toHaveBeenCalledWith(
      expect.anything(),
      'finance.record_payments',
      expect.objectContaining({
        kind: 'travel_payable_ready',
        subject: { type: 'payable', id: 'pay1', projectId: 'p1' },
      }),
      'boss',
    );
    // The worker hears too.
    expect(db.notify).toHaveBeenCalledWith(
      expect.anything(),
      { userId: 'worker' },
      expect.objectContaining({ kind: 'travel_claim_decided' }),
    );
  });

  it('declining makes no bill and tells finance nothing', async () => {
    const { updates, result } = decide(false);
    await result;
    expect(updates.some((u) => u.table === payables)).toBe(false);
    expect(db.notifyHolders).not.toHaveBeenCalled();
    expect(db.postPayableApproved).not.toHaveBeenCalled();
  });

  it('refuses a claim that is already decided', async () => {
    const { updates, result } = decide(true, claim({ status: 'approved' }));
    await expect(result).rejects.toMatchObject({ status: 409 });
    expect(updates).toHaveLength(0);
  });
});
