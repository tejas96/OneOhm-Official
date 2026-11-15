import { beforeEach, describe, expect, it, vi } from 'vitest';

const lib = vi.hoisted(() => ({
  notify: vi.fn(),
  tellClaimDeciders: vi.fn(),
  approveTravelClaim: vi.fn(async () => 'pay1'),
}));
vi.mock('./notify', () => ({ notify: lib.notify }));
vi.mock('./travel-approvers', () => ({ tellClaimDeciders: lib.tellClaimDeciders }));
vi.mock('./travel-claim-approve', () => ({ approveTravelClaim: lib.approveTravelClaim }));

import { auditLog } from './schema/records.schema';
import { travelClaims } from './schema/site-activity.schema';
import { policyWith, settle, snap } from './travel-claim-test-kit';

beforeEach(() => vi.clearAllMocks());

describe('route points that arrive after the day closed', () => {
  const pending = (over: Record<string, unknown> = {}) => ({
    id: 'c9',
    status: 'pending',
    autoMade: true,
    withdrawnByResumeAt: null,
    reviewReasons: null,
    distanceM: 10_000,
    amountPaise: 5_000,
    ...over,
  });

  it('brings a pending claim up to the new km and notes it in the audit', async () => {
    const { updates, inserts, result } = settle([pending()]);
    await result;
    expect(updates.find((u) => u.table === travelClaims)?.set).toMatchObject({
      distanceM: 18_400,
      amountPaise: 9_200,
      visits: 2,
    });
    expect(inserts.find((i) => i.table === auditLog)?.values).toMatchObject({
      action: 'travel_claim.refreshed',
      entityId: 'c9',
      data: expect.objectContaining({ fromAmountPaise: 5_000, toAmountPaise: 9_200 }),
    });
  });

  it('never changes an approved claim', async () => {
    const { updates, inserts, result } = settle([pending({ status: 'approved' })]);
    await result;
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it('does nothing when neither the km nor the reasons changed', async () => {
    const { updates, result } = settle([
      pending({ distanceM: 18_400, amountPaise: 9_200, reviewReasons: null }),
    ]);
    await result;
    expect(updates).toHaveLength(0);
  });

  it('refreshes the reasons on a claim the person made, without the automatic-approval reason', async () => {
    const { updates, inserts, result } = settle(
      [pending({ autoMade: false, distanceM: 18_400, amountPaise: 9_200, reviewReasons: null })],
      {},
      snap({ gapMinutes: 45, gapCount: 1 }),
      policyWith({ autoApprove: false }),
    );
    await result;
    expect(updates.find((u) => u.table === travelClaims)?.set).toMatchObject({
      reviewReasons: ['route_gap'],
    });
    // Same km: only the reasons moved, so no refreshed-km audit entry.
    expect(inserts.filter((i) => i.table === auditLog)).toHaveLength(0);
  });

  it('does not make a second claim beside a live one', async () => {
    const { inserts, result } = settle([pending()]);
    await result;
    expect(inserts.every((i) => i.table === auditLog)).toBe(true);
  });
});
