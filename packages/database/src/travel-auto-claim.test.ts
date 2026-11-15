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
import { busiestProject } from './travel-claim-review';
import { at, cleanVisits, plainDay, policyWith, settle, snap } from './travel-claim-test-kit';

beforeEach(() => vi.clearAllMocks());

describe('busiestProject', () => {
  it('picks the project with the most visits', () => {
    expect(
      busiestProject([
        { projectId: 'a', checkInAt: at(5) },
        { projectId: 'b', checkInAt: at(6) },
        { projectId: 'b', checkInAt: at(7) },
      ]),
    ).toBe('b');
  });
  it('breaks a tie by the first visit', () => {
    expect(
      busiestProject([
        { projectId: 'b', checkInAt: at(6) },
        { projectId: 'a', checkInAt: at(5) },
      ]),
    ).toBe('a');
  });
  it('is null with no project', () => {
    expect(busiestProject([{ projectId: null, checkInAt: at(5) }])).toBeNull();
    expect(busiestProject([])).toBeNull();
  });
});

describe('the automatic claim at day close', () => {
  it('makes a clean day pending and tells the worker it will be approved tomorrow morning', async () => {
    const { inserts, result } = settle([]);
    expect(await result).toBe(true);
    const made = inserts.find((i) => i.table === travelClaims)?.values;
    expect(made).toMatchObject({
      userId: 'worker',
      distanceM: 18_400,
      amountPaise: 9_200,
      autoMade: true,
      reviewReasons: null,
      projectId: 'p1',
      note: null,
    });
    // Approval waits for the morning job, even for a clean day.
    expect(lib.approveTravelClaim).not.toHaveBeenCalled();
    expect(lib.notify).toHaveBeenCalledWith(
      expect.anything(),
      { userId: 'worker' },
      expect.objectContaining({
        kind: 'travel_claim_ready',
        title: expect.stringContaining('₹92'),
        body: 'It will be approved tomorrow morning if everything checks out.',
      }),
    );
    expect(lib.tellClaimDeciders).not.toHaveBeenCalled();
    expect(inserts.find((i) => i.table === auditLog)?.values).toMatchObject({
      action: 'travel_claim.auto_made',
      actorUserId: null,
    });
  });

  it('leaves a flagged day pending with its reasons, and tells the worker and the deciders', async () => {
    const { inserts, result } = settle([], {}, snap({ gapMinutes: 45, gapCount: 1 }));
    await result;
    expect(inserts.find((i) => i.table === travelClaims)?.values).toMatchObject({
      autoMade: true,
      reviewReasons: ['route_gap'],
    });
    expect(lib.approveTravelClaim).not.toHaveBeenCalled();
    expect(lib.notify).toHaveBeenCalledWith(
      expect.anything(),
      { userId: 'worker' },
      expect.objectContaining({ kind: 'travel_claim_sent', title: expect.stringContaining('₹92') }),
    );
    expect(lib.tellClaimDeciders).toHaveBeenCalled();
  });

  it('keeps every claim pending, with a reason, when automatic approval is switched off', async () => {
    const { inserts, result } = settle([], {}, snap(), policyWith({ autoApprove: false }));
    await result;
    expect(inserts.find((i) => i.table === travelClaims)?.values).toMatchObject({
      reviewReasons: ['auto_approve_off'],
    });
    expect(lib.notify).toHaveBeenCalledWith(
      expect.anything(),
      { userId: 'worker' },
      expect.objectContaining({ kind: 'travel_claim_sent' }),
    );
    expect(lib.approveTravelClaim).not.toHaveBeenCalled();
  });

  it('reads the day’s facts: far check-in, auto-closed day, delayed tap and leave', async () => {
    const far = [{ ...cleanVisits[0], far: true }];
    const { inserts, result } = settle([], {
      visits: far,
      day: { ...plainDay, autoClosedAt: new Date(), tapDelayed: true },
      leave: [{ id: 'l1' }],
    });
    await result;
    expect(inserts.find((i) => i.table === travelClaims)?.values).toMatchObject({
      reviewReasons: ['far_check_in', 'auto_closed', 'delayed_tap', 'on_leave'],
    });
  });

  it('flags a start or end away from an office, a short route, an uncapped short day', async () => {
    const out = settle(
      [],
      { day: { ...plainDay, checkInInside: false, checkOutInside: false } },
      snap({ routeM: 10_000, straightM: 14_200, paidM: 14_200 }),
    );
    await out.result;
    expect(out.inserts.find((i) => i.table === travelClaims)?.values).toMatchObject({
      reviewReasons: ['short_route', 'start_outside_office', 'end_outside_office'],
    });
    const short = settle([], {}, snap({ straightM: 600, routeM: 1_500, paidM: 1_500 }));
    await short.result;
    expect(short.inserts.find((i) => i.table === travelClaims)?.values).toMatchObject({
      reviewReasons: ['uncapped_route'],
    });
  });

  it('makes nothing when the policy has automatic claims off', async () => {
    const { inserts, result } = settle([], {}, snap(), policyWith({ autoClaim: false }));
    expect(await result).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it('makes nothing for a day with no km (no site visit) or no rate', async () => {
    for (const patch of [{ paidM: 0, distanceM: 0, visits: 0 }, { ratePaisePerKm: 0 }]) {
      const { inserts, result } = settle([], {}, snap(patch));
      await result;
      expect(inserts).toHaveLength(0);
    }
  });

  it('makes nothing when the day already has a cancelled or declined claim', async () => {
    const { inserts, result } = settle([
      { id: 'old', status: 'cancelled', withdrawnByResumeAt: null },
    ]);
    await result;
    expect(inserts).toHaveLength(0);
  });

  it('makes a fresh claim when the only earlier one was withdrawn by a resume', async () => {
    const { inserts, result } = settle([
      { id: 'old', status: 'cancelled', withdrawnByResumeAt: new Date() },
    ]);
    expect(await result).toBe(true);
    expect(inserts.find((i) => i.table === travelClaims)?.values).toMatchObject({ autoMade: true });
  });
});
