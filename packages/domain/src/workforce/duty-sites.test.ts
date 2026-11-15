import { describe, expect, it } from 'vitest';
import {
  ambiguousSitesAt,
  type DutySite,
  type DutySiteCandidate,
  selectDutySites,
  worksTodayAtSite,
} from './duty-sites';

const today = '2026-11-16';
const base: DutySiteCandidate = {
  id: 't1',
  kind: 'installation',
  label: 'Sharma home',
  placeId: 'p1',
  latitude: 16.85,
  longitude: 74.58,
  status: 'ready',
  startDate: today,
  dueDate: today,
  plannedDays: [],
};
const one = (patch: Partial<DutySiteCandidate>) => ({ ...base, ...patch });

describe('worksTodayAtSite', () => {
  it('counts an open task scheduled today', () => {
    expect(worksTodayAtSite(base, today)).toBe(true);
    expect(worksTodayAtSite(one({ startDate: '2026-11-14', dueDate: '2026-11-18' }), today)).toBe(
      true,
    );
  });
  it('leaves out work on another day, done, in review or still blocked', () => {
    expect(worksTodayAtSite(one({ startDate: '2026-11-17', dueDate: '2026-11-18' }), today)).toBe(
      false,
    );
    expect(worksTodayAtSite(one({ status: 'completed' }), today)).toBe(false);
    expect(worksTodayAtSite(one({ status: 'in_review' }), today)).toBe(false);
    expect(worksTodayAtSite(one({ status: 'pending' }), today)).toBe(false);
    expect(worksTodayAtSite(one({ status: 'waiting' }), today)).toBe(false);
    expect(worksTodayAtSite(one({ status: 'blocked' }), today)).toBe(false);
  });
  it('counts a planned visit today even when the task dates are elsewhere', () => {
    const planned = one({
      status: 'pending',
      startDate: null,
      dueDate: null,
      plannedDays: [today],
    });
    expect(worksTodayAtSite(planned, today)).toBe(true);
  });
  it('takes a service request only with a visit today', () => {
    const service = one({ kind: 'service', status: 'open', startDate: null, dueDate: null });
    expect(worksTodayAtSite(service, today)).toBe(false);
    expect(worksTodayAtSite({ ...service, plannedDays: [today] }, today)).toBe(true);
  });
});

describe('selectDutySites', () => {
  it('needs a saved pin and gives the policy radius', () => {
    const sites = selectDutySites(
      [base, one({ id: 't2', placeId: 'p2', latitude: null })],
      today,
      150,
    );
    expect(sites).toEqual([
      {
        id: 't1',
        kind: 'installation',
        label: 'Sharma home',
        latitude: 16.85,
        longitude: 74.58,
        radiusM: 150,
      },
    ]);
  });
  it('shares one fence between two jobs at one place, planned visit first', () => {
    const sites = selectDutySites(
      [one({ id: 'a' }), one({ id: 'b', plannedDays: [today] })],
      today,
      150,
    );
    expect(sites.map((site) => site.id)).toEqual(['b']);
  });
  it('keeps at most 18, the planned ones first', () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      one({
        id: `t${String(index).padStart(2, '0')}`,
        placeId: `p${index}`,
        plannedDays: index === 24 ? [today] : [],
      }),
    );
    const sites = selectDutySites(many, today, 100);
    expect(sites).toHaveLength(18);
    expect(sites[0]?.id).toBe('t24');
  });
});

describe('ambiguousSitesAt', () => {
  const site = (id: string, latitude: number): DutySite => ({
    id,
    kind: 'installation',
    label: id,
    latitude,
    longitude: 74.58,
    radiusM: 150,
  });
  // 0.001 degree of latitude is about 111 m.
  const a = site('a', 16.85);
  const b = site('b', 16.851);
  const far = site('far', 16.9);
  it('names both sites when a point is within the fence of two close pins', () => {
    const point = { latitude: 16.8505, longitude: 74.58 };
    expect(ambiguousSitesAt(point, [a, b, far]).map((one) => one.id)).toEqual(['a', 'b']);
  });
  it('is empty at one site, or at none', () => {
    expect(ambiguousSitesAt({ latitude: 16.8494, longitude: 74.58 }, [a, b])).toEqual([]);
    expect(ambiguousSitesAt({ latitude: 16.8494, longitude: 74.58 }, [a])).toEqual([]);
    expect(ambiguousSitesAt({ latitude: 17, longitude: 74.58 }, [a, b])).toEqual([]);
  });
});
