import { beforeEach, describe, expect, it, vi } from 'vitest';

const lib = vi.hoisted(() => ({
  notify: vi.fn(),
  tellClaimDeciders: vi.fn(),
  approveTravelClaim: vi.fn(async () => 'pay1'),
}));
vi.mock('./notify', () => ({ notify: lib.notify }));
vi.mock('./travel-approvers', () => ({ tellClaimDeciders: lib.tellClaimDeciders }));
vi.mock('./travel-claim-approve', () => ({ approveTravelClaim: lib.approveTravelClaim }));

import { travelClaims } from './schema/site-activity.schema';
import { noStart, settle, snap, startAt } from './travel-claim-test-kit';

beforeEach(() => vi.clearAllMocks());

describe('the automatic claim, where the day started and ended', () => {
  it('does not flag a start at home when home is the saved base', async () => {
    const home = { latitude: 16.85, longitude: 74.58 };
    const out = settle([], { start: startAt(home, home) });
    await out.result;
    expect(out.inserts.find((i) => i.table === travelClaims)?.values).toMatchObject({
      reviewReasons: null,
    });
  });

  it('does not flag a start near an office, with no base saved', async () => {
    const start = { latitude: 16.85, longitude: 74.58 };
    const office = {
      id: 'o',
      name: 'Office',
      ...start,
      radiusM: 100,
      active: true,
      createdAt: new Date(),
    };
    const out = settle([], { start: startAt(start, null, [office]) });
    await out.result;
    expect(out.inserts.find((i) => i.table === travelClaims)?.values).toMatchObject({
      reviewReasons: null,
    });
  });

  it('flags a start far from the base and from every office', async () => {
    const out = settle([], {
      start: startAt({ latitude: 17.2, longitude: 74.58 }, { latitude: 16.85, longitude: 74.58 }),
    });
    await out.result;
    expect(out.inserts.find((i) => i.table === travelClaims)?.values).toMatchObject({
      reviewReasons: ['far_from_base', 'end_unknown_place'],
    });
  });

  it('flags a start away from every office when no base is saved', async () => {
    const out = settle([], { start: startAt({ latitude: 17.2, longitude: 74.58 }, null) });
    await out.result;
    expect(out.inserts.find((i) => i.table === travelClaims)?.values).toMatchObject({
      reviewReasons: ['start_unknown_place', 'end_unknown_place'],
    });
  });

  it('flags only the end when the day starts at home and ends far from home and every office', async () => {
    const home = { latitude: 16.85, longitude: 74.58 };
    const out = settle([], {
      start: startAt(home, home, [], { latitude: 17.2, longitude: 74.58 }),
    });
    await out.result;
    expect(out.inserts.find((i) => i.table === travelClaims)?.values).toMatchObject({
      reviewReasons: ['end_unknown_place'],
    });
  });

  it('does not flag an end at an office, with no base saved', async () => {
    const office = {
      id: 'o',
      name: 'Office',
      latitude: 16.9,
      longitude: 74.6,
      radiusM: 100,
      active: true,
    };
    const out = settle([], {
      start: startAt({ latitude: 16.9, longitude: 74.6 }, null, [office], office),
    });
    await out.result;
    expect(out.inserts.find((i) => i.table === travelClaims)?.values).toMatchObject({
      reviewReasons: null,
    });
  });

  it('is not auto-approved when a day with visits has no start position', async () => {
    const out = settle([], { start: noStart });
    await out.result;
    expect(out.inserts.find((i) => i.table === travelClaims)?.values).toMatchObject({
      reviewReasons: ['start_unknown', 'end_unknown'],
    });
    expect(lib.approveTravelClaim).not.toHaveBeenCalled();
  });

  it('says only the end is unknown when the check-out had no position', async () => {
    const home = { latitude: 16.85, longitude: 74.58 };
    const out = settle([], { start: startAt(home, home, [], null) });
    await out.result;
    expect(out.inserts.find((i) => i.table === travelClaims)?.values).toMatchObject({
      reviewReasons: ['end_unknown'],
    });
  });

  it('leaves the start and end alone for a day with no site visit', async () => {
    const out = settle([], { start: noStart }, snap({ visits: 0 }));
    await out.result;
    expect(out.inserts.find((i) => i.table === travelClaims)?.values).toMatchObject({
      reviewReasons: ['no_visits'],
    });
  });
});
