import { beforeEach, describe, expect, it, vi } from 'vitest';

const policy = vi.hoisted(() => ({ loadPolicy: vi.fn() }));
const sites = vi.hoisted(() => ({ dutySitesFor: vi.fn() }));
vi.mock('../workforce/policy', () => policy);
vi.mock('./duty-sites.service', () => sites);

import { autoCheckInSkip } from './site-visit-skip';
import { harness } from './site-visit-test-kit';

const at = new Date('2026-11-16T07:00:00Z');
const site = { latitude: 16.85, longitude: 74.58 };
const away = { latitude: 16.86, longitude: 74.58, accuracyM: 20, mocked: false };
const here = { latitude: 16.85, longitude: 74.58, accuracyM: 20, mocked: false };
const point = (where: typeof away, minute: number) => ({
  ...where,
  recordedAt: new Date(at.getTime() + minute * 60_000),
});
const task = { taskId: 't1' };
const duty = (id: string, latitude: number) => ({
  id,
  kind: 'installation',
  label: id,
  latitude,
  longitude: 74.58,
  radiusM: 150,
});

beforeEach(() => {
  vi.clearAllMocks();
  policy.loadPolicy.mockResolvedValue({ travel: { siteFenceM: 150 } });
  sites.dutySitesFor.mockResolvedValue([]);
});

describe('an automatic check-in that is left alone', () => {
  it('goes ahead for a site with no visit today', async () => {
    const h = harness();
    h.selects.push([]);
    expect(await autoCheckInSkip(h.db as never, 'u1', task, site, null, at)).toBeNull();
  });

  it('waits for the person to leave after a visit here closed', async () => {
    const h = harness();
    h.selects.push([{ at }], [point(here, 5), point({ ...away, accuracyM: 300 }, 8)]);
    expect(await autoCheckInSkip(h.db as never, 'u1', task, site, null, at)).toBe(
      'must_leave_first',
    );
  });

  it('does not count a fake point or one just outside the fence', async () => {
    const h = harness();
    const edge = { ...here, latitude: 16.8518 };
    h.selects.push([{ at }], [point({ ...away, mocked: true }, 5), point(edge, 8)]);
    expect(await autoCheckInSkip(h.db as never, 'u1', task, site, null, at)).toBe(
      'must_leave_first',
    );
  });

  it('goes ahead once a kept point lies beyond the fence and its margin', async () => {
    const h = harness();
    h.selects.push([{ at }], [point(away, 5)]);
    expect(await autoCheckInSkip(h.db as never, 'u1', task, site, null, at)).toBeNull();
  });

  it('is left to the person between two sites whose fences overlap', async () => {
    const h = harness();
    h.selects.push([]);
    sites.dutySitesFor.mockResolvedValue([duty('t1', 16.85), duty('t2', 16.851)]);
    const between = { latitude: 16.8505, longitude: 74.58 };
    expect(await autoCheckInSkip(h.db as never, 'u1', task, site, between, at)).toBe(
      'ambiguous_site',
    );
    // A reading at one of them alone is fine.
    const h2 = harness();
    h2.selects.push([]);
    expect(
      await autoCheckInSkip(
        h2.db as never,
        'u1',
        task,
        site,
        { latitude: 16.8494, longitude: 74.58 },
        at,
      ),
    ).toBeNull();
  });
});
