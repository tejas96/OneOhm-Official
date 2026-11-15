import { beforeEach, describe, expect, it, vi } from 'vitest';

const read = vi.hoisted(() => ({ travelDay: vi.fn(), readClaims: vi.fn() }));
const db = vi.hoisted(() => ({
  notify: vi.fn(),
  approveTravelClaim: vi.fn(async () => 'pay1'),
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

import { travelClaims } from '@oneohm/database';
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

function decide(approve: boolean, row: object | null = claim(), expectedAmountPaise?: number) {
  const { tx, updates } = scripted(
    [row ? [row] : [], [{ fullName: 'Ravi' }], [{ name: 'Ravi' }]],
    [[{ id: 'pay1' }]],
  );
  read.readClaims.mockResolvedValue([{ id: 'c1' }]);
  const result = new TravelClaimsService(tx as never).decide(
    actor('boss'),
    'c1',
    approve,
    'ok',
    expectedAmountPaise,
  );
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

  it('approving goes through the shared approval, as the deciding person', async () => {
    const { updates, result } = decide(true);
    await result;
    expect(db.approveTravelClaim).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'c1' }),
      { userId: 'boss', note: 'ok' },
    );
    // The shared approval writes the claim; the service writes nothing of its own.
    expect(updates.find((u) => u.table === travelClaims)).toBeUndefined();
  });

  it('declining makes no bill and tells finance nothing', async () => {
    const { updates, result } = decide(false);
    await result;
    expect(db.approveTravelClaim).not.toHaveBeenCalled();
    expect(updates.find((u) => u.table === travelClaims)?.set).toMatchObject({
      status: 'rejected',
      decidedByUserId: 'boss',
    });
    expect(db.notify).toHaveBeenCalledWith(
      expect.anything(),
      { userId: 'worker' },
      expect.objectContaining({ kind: 'travel_claim_decided' }),
    );
  });

  it('refuses a claim that is already decided', async () => {
    const { updates, result } = decide(true, claim({ status: 'approved' }));
    await expect(result).rejects.toMatchObject({ status: 409 });
    expect(updates).toHaveLength(0);
    expect(db.approveTravelClaim).not.toHaveBeenCalled();
  });

  it('decides when the amount the approver saw is still the amount', async () => {
    const { result } = decide(true, claim(), 8400);
    await result;
    expect(db.approveTravelClaim).toHaveBeenCalled();
  });

  it('refuses with 409 amount_changed, and the new amount, when route points changed it', async () => {
    const { updates, result } = decide(true, claim({ amountPaise: 9200 }), 8400);
    await expect(result).rejects.toMatchObject({
      status: 409,
      code: 'amount_changed',
      details: { amountPaise: 9200 },
    });
    expect(updates).toHaveLength(0);
    expect(db.approveTravelClaim).not.toHaveBeenCalled();
  });

  it('decides without an expected amount, as before', async () => {
    const { result } = decide(true, claim({ amountPaise: 9200 }));
    await result;
    expect(db.approveTravelClaim).toHaveBeenCalled();
  });
});
