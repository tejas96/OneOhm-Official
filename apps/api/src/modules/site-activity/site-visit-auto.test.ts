import { beforeEach, describe, expect, it, vi } from 'vitest';

const tracking = vi.hoisted(() => ({ trackingFor: vi.fn() }));
const floor = vi.hoisted(() => ({ autoFloor: vi.fn() }));
vi.mock('../workforce/tracking', () => tracking);
vi.mock('./site-visit-floor', () => floor);

import { phonePosition, phoneVisit, visitMoment } from './site-visit-auto';
import { actor } from './site-visit-test-kit';

const now = new Date('2026-11-16T05:30:00Z');
beforeEach(() => floor.autoFloor.mockResolvedValue(null));
const state = (autoSiteVisits: boolean, status = 'on') =>
  tracking.trackingFor.mockResolvedValue({
    policy: { travel: { autoSiteVisits } },
    status: { state: status },
  });

describe('visitMoment', () => {
  it('is now for a tap', async () => {
    expect(await visitMoment({} as never, actor('u1'), undefined, now, 'in')).toEqual({
      at: now,
      source: 'manual',
      delayed: false,
    });
  });

  it('is the phone event time for a fence event', async () => {
    state(true);
    const at = new Date(now.getTime() - 10 * 60_000);
    expect(
      await visitMoment(
        {} as never,
        actor('u1'),
        { source: 'auto_fence', tappedAt: at.toISOString() },
        now,
        'in',
      ),
    ).toEqual({ at, source: 'auto_fence', delayed: false });
  });

  it('refuses an automatic check-in when the switch is off or consent is gone', async () => {
    state(false);
    await expect(
      visitMoment({} as never, actor('u1'), { source: 'auto_fence' }, now, 'in'),
    ).rejects.toMatchObject({ status: 409, code: 'auto_off' });
    state(true, 'no_consent');
    await expect(
      visitMoment({} as never, actor('u1'), { source: 'auto_fence' }, now, 'in'),
    ).rejects.toMatchObject({ code: 'auto_off' });
  });

  it('still lets an automatic check-out through with the switch off', async () => {
    state(false);
    expect(
      (await visitMoment({} as never, actor('u1'), { source: 'auto_fence' }, now, 'out')).source,
    ).toBe('auto_fence');
  });

  it('refuses an automatic event older than 2 hours as auto_event_too_old', async () => {
    state(true);
    const old = new Date(now.getTime() - 121 * 60_000).toISOString();
    for (const direction of ['in', 'out'] as const)
      await expect(
        visitMoment(
          {} as never,
          actor('u1'),
          { source: 'auto_fence', tappedAt: old },
          now,
          direction,
        ),
      ).rejects.toMatchObject({ status: 422, code: 'auto_event_too_old' });
  });

  it('keeps an event of 100 minutes, marked delayed, as it happened', async () => {
    state(true);
    const at = new Date(now.getTime() - 100 * 60_000);
    expect(
      await visitMoment(
        {} as never,
        actor('u1'),
        { source: 'auto_route', tappedAt: at.toISOString() },
        now,
        'in',
      ),
    ).toEqual({ at, source: 'auto_route', delayed: true });
  });

  it('never backdates before the latest check-out today: the server time is used', async () => {
    state(true);
    floor.autoFloor.mockResolvedValue(new Date(now.getTime() - 20 * 60_000));
    const early = new Date(now.getTime() - 40 * 60_000).toISOString();
    expect(
      await visitMoment(
        {} as never,
        actor('u1'),
        { source: 'auto_fence', tappedAt: early },
        now,
        'in',
      ),
    ).toEqual({ at: now, source: 'auto_fence', delayed: false });
  });

  it('refuses an automatic check-in from a fake location, but not a check-out', async () => {
    state(true);
    await expect(
      visitMoment({} as never, actor('u1'), { source: 'auto_fence', mocked: true }, now, 'in'),
    ).rejects.toMatchObject({ status: 422, code: 'mocked_location' });
    expect(
      (
        await visitMoment(
          {} as never,
          actor('u1'),
          { source: 'auto_fence', mocked: true },
          now,
          'out',
        )
      ).source,
    ).toBe('auto_fence');
  });
});

describe('phoneVisit', () => {
  it('is nothing for a plain tap', () => {
    expect(phoneVisit({})).toBeUndefined();
    expect(phoneVisit({ source: 'auto_fence', tappedAt: 'x' })).toEqual({
      source: 'auto_fence',
      tappedAt: 'x',
      mocked: false,
    });
    expect(phoneVisit({ source: 'auto_fence', mocked: true })).toMatchObject({ mocked: true });
  });
  it('keeps no position from a fake location', () => {
    const position = { latitude: 1, longitude: 2 };
    expect(phonePosition({ position, source: 'auto_fence', mocked: true })).toBeNull();
    expect(phonePosition({ position, source: 'auto_fence', mocked: false })).toBe(position);
    expect(phonePosition({ position, mocked: true })).toBe(position);
  });
});
