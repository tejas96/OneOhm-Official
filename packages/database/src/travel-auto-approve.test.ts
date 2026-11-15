import { beforeEach, describe, expect, it, vi } from 'vitest';

const lib = vi.hoisted(() => ({
  notify: vi.fn(),
  tellClaimDeciders: vi.fn(),
  approveTravelClaim: vi.fn(async () => 'pay1'),
}));
vi.mock('./notify', () => ({ notify: lib.notify }));
vi.mock('./travel-approvers', () => ({ tellClaimDeciders: lib.tellClaimDeciders }));
vi.mock('./travel-claim-approve', () => ({ approveTravelClaim: lib.approveTravelClaim }));

import type { WorkforcePolicy } from '@oneohm/domain';
import { travelClaims } from './schema/site-activity.schema';
import { approveCleanAutoClaims, settleMissedDays } from './travel-auto-approve';
import { cleanVisits, plainDay, policyWith, scriptedTx, snap } from './travel-claim-test-kit';

beforeEach(() => vi.clearAllMocks());

describe('the morning approval', () => {
  const claim = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    userId: 'worker',
    workDate: '2026-11-14',
    status: 'pending',
    autoMade: true,
    withdrawnByResumeAt: null,
    distanceM: 18_400,
    amountPaise: 9_200,
    reviewReasons: null,
    ...over,
  });
  /** Reads in order: the due claim ids, then the locked claim, the saved day, visits, the day, leave. */
  const morning = (
    over: {
      claim?: unknown;
      snapshot?: unknown;
      extra?: { visits?: unknown[]; day?: unknown; leave?: unknown[] };
      policy?: WorkforcePolicy;
    } = {},
  ) => {
    const kit = scriptedTx([
      [{ id: 'c1' }],
      [over.claim ?? claim()],
      over.snapshot === null ? [] : [over.snapshot ?? snap()],
      over.extra?.visits ?? cleanVisits,
      [over.extra?.day ?? plainDay],
      over.extra?.leave ?? [],
      [{ name: 'Ravi' }],
    ]);
    return {
      ...kit,
      result: approveCleanAutoClaims(
        kit.tx,
        '2026-11-15',
        over.policy ?? policyWith({ autoApprove: true }),
      ),
    };
  };

  it('approves a clean automatic claim of an earlier day as the system', async () => {
    const { result } = morning();
    expect(await result).toMatchObject({ approved: 1, failed: 0 });
    expect(lib.approveTravelClaim).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'c1' }),
      { userId: null, note: 'Approved automatically: clean day' },
    );
  });

  it('does nothing at all while automatic approval is switched off', async () => {
    const { result } = morning({ policy: policyWith({ autoApprove: false }) });
    expect(await result).toMatchObject({ approved: 0 });
    expect(lib.approveTravelClaim).not.toHaveBeenCalled();
  });

  it('skips a claim decided, withdrawn or made by the person since it was listed', async () => {
    for (const over of [
      { status: 'approved' },
      { status: 'cancelled', withdrawnByResumeAt: new Date() },
      { autoMade: false },
    ]) {
      const { result } = morning({ claim: claim(over) });
      expect(await result).toMatchObject({ approved: 0, failed: 0 });
    }
    expect(lib.approveTravelClaim).not.toHaveBeenCalled();
  });

  it('skips a claim whose day has no saved travel, or whose km no longer match it', async () => {
    for (const kit of [morning({ snapshot: null }), morning({ snapshot: snap({ paidM: 20_000 }) })])
      expect(await kit.result).toMatchObject({ approved: 0 });
    expect(lib.approveTravelClaim).not.toHaveBeenCalled();
  });

  it('keeps a claim that is no longer clean pending, with fresh reasons, and tells the deciders', async () => {
    const { updates, result } = morning({
      snapshot: snap({ gapMinutes: 60, gapCount: 1 }),
    });
    expect(await result).toMatchObject({ approved: 0 });
    expect(lib.approveTravelClaim).not.toHaveBeenCalled();
    expect(updates.find((u) => u.table === travelClaims)?.set).toMatchObject({
      reviewReasons: ['route_gap'],
    });
    expect(lib.tellClaimDeciders).toHaveBeenCalled();
  });

  it('counts a failing claim and goes on', async () => {
    lib.approveTravelClaim.mockRejectedValueOnce(new Error('ledger'));
    const { result } = morning();
    expect(await result).toMatchObject({ approved: 0, failed: 1 });
  });
});

describe('settling closed days again', () => {
  it('makes the claim for a day saved with none, when automatic claims are on', async () => {
    const kit = scriptedTx(
      // The first read is the list of days; the second is the "has no claim" subquery inside it.
      [[snap()], [], [], cleanVisits, [plainDay], [], [{ name: 'Ravi' }]],
      {
        travel_claims: [[{ id: 'c1', userId: 'worker', workDate: '2026-11-14' }]],
      },
    );
    const out = await settleMissedDays(kit.tx, '2026-11-15', policyWith());
    expect(out).toMatchObject({ made: 1, failed: 0 });
    expect(kit.inserts.find((i) => i.table === travelClaims)?.values).toMatchObject({
      autoMade: true,
    });
  });

  it('does nothing with automatic claims off', async () => {
    const kit = scriptedTx([[snap()]]);
    expect(await settleMissedDays(kit.tx, '2026-11-15', policyWith({ autoClaim: false }))).toEqual({
      made: 0,
      failed: 0,
      firstError: null,
    });
    expect(kit.inserts).toHaveLength(0);
  });
});
