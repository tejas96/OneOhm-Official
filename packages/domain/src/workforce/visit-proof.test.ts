import { describe, expect, it } from 'vitest';
import type { RoutePoint } from './route-km';
import { siteCoverage, type VisitProofInput, visitProof } from './visit-proof';

const T0 = new Date('2026-11-16T05:00:00Z');
const DEG_PER_M = 1 / 111_195;
const SITE = { latitude: 16.85, longitude: 74.58 };
const at = (minute: number, metresNorth = 0, mocked = false): RoutePoint => ({
  recordedAt: new Date(T0.getTime() + minute * 60_000),
  latitude: SITE.latitude + metresNorth * DEG_PER_M,
  longitude: SITE.longitude,
  accuracyM: 10,
  mocked,
});
const every2 = (from: number, to: number, metresNorth = 0) =>
  Array.from({ length: Math.floor((to - from) / 2) + 1 }, (_, i) => at(from + i * 2, metresNorth));
const visit = (over: Partial<VisitProofInput> = {}): VisitProofInput => ({
  checkInAt: at(0).recordedAt,
  checkOutAt: at(30).recordedAt,
  site: SITE,
  radiusM: 150,
  points: every2(0, 30),
  checkInLocated: true,
  checkInFar: false,
  photos: [],
  ...over,
});

describe('visitProof', () => {
  it('verifies a visit seen at the site, long enough, clean', () => {
    expect(visitProof(visit())).toEqual({ proof: 'verified', reasons: [] });
    expect(visitProof(visit({ photos: [{ far: false }, { far: true }] })).proof).toBe('verified');
  });

  it('counts a point just beyond the fence (fence + 50 m) as at the site', () => {
    expect(visitProof(visit({ points: every2(0, 30, 190) })).proof).toBe('verified');
    expect(visitProof(visit({ points: every2(0, 30, 260) })).reasons).toEqual(['not_seen_at_site']);
  });

  it('is doubtful for a short visit', () => {
    const short = visit({ checkOutAt: at(8).recordedAt, points: every2(0, 8) });
    expect(visitProof(short)).toEqual({ proof: 'doubtful', reasons: ['short_visit'] });
  });

  it('is doubtful when points near the site cover under 60% of the visit', () => {
    const half = visit({ points: [...every2(0, 14), ...every2(16, 30, 2000)] });
    expect(visitProof(half).reasons).toEqual(['not_seen_at_site']);
  });

  it('is doubtful with any mocked point during the visit, even with nothing else', () => {
    const faked = visit({ points: [...every2(0, 30), at(15, 0, true)] });
    expect(visitProof(faked)).toEqual({ proof: 'doubtful', reasons: ['fake_gps'] });
    const onlyFake = visit({ points: [at(15, 0, true)], checkInLocated: false });
    expect(visitProof(onlyFake).proof).toBe('doubtful');
  });

  it('is doubtful for a far check-in, or when every placed photo is far', () => {
    expect(visitProof(visit({ checkInFar: true })).reasons).toEqual(['far_check_in']);
    expect(visitProof(visit({ photos: [{ far: true }, { far: null }] })).reasons).toEqual([
      'photo_far',
    ]);
  });

  it('gives every failing reason at once', () => {
    const bad = visit({
      checkOutAt: at(6).recordedAt,
      points: [at(2, 3000), at(4, 0, true)],
      checkInFar: true,
    });
    expect(visitProof(bad).reasons).toEqual([
      'short_visit',
      'not_seen_at_site',
      'far_check_in',
      'fake_gps',
    ]);
  });

  it('has no proof with no location at all, or no site pin to compare with', () => {
    expect(visitProof(visit({ points: [], checkInLocated: false }))).toEqual({
      proof: 'no_proof',
      reasons: ['no_location'],
    });
    expect(visitProof(visit({ site: null }))).toEqual({
      proof: 'no_proof',
      reasons: ['site_unknown'],
    });
  });

  it('ignores points outside the visit', () => {
    const before = visit({ points: [...every2(-60, -10, 2000), ...every2(0, 30)] });
    expect(visitProof(before).proof).toBe('verified');
  });
});

describe('visitProof without a route expected', () => {
  const off = (over: Partial<VisitProofInput> = {}) =>
    visit({ trackingExpected: false, points: [], ...over });

  it('verifies by a near check-in and the visit length, never asking for route points', () => {
    expect(visitProof(off())).toEqual({ proof: 'verified', reasons: [] });
    expect(visitProof(visit({ points: [] })).reasons).toEqual(['not_seen_at_site']);
  });

  it('is still doubtful for a far check-in, a short visit, a far photo or a mocked point', () => {
    expect(visitProof(off({ checkInFar: true })).reasons).toEqual(['far_check_in']);
    expect(visitProof(off({ checkOutAt: at(5).recordedAt })).reasons).toEqual(['short_visit']);
    expect(visitProof(off({ photos: [{ far: true }] })).reasons).toEqual(['photo_far']);
    expect(visitProof(off({ points: [at(3, 0, true)] })).reasons).toEqual(['fake_gps']);
  });

  it('has no proof without a located check-in, or with no distance to judge', () => {
    expect(visitProof(off({ checkInLocated: false }))).toEqual({
      proof: 'no_proof',
      reasons: ['no_location'],
    });
    expect(visitProof(off({ checkInFar: null })).proof).toBe('no_proof');
    expect(visitProof(off({ site: null })).reasons).toEqual(['site_unknown']);
  });
});

describe('siteCoverage', () => {
  it('lets each point stand for a minute either side (the 2-minute cadence)', () => {
    const input = visit();
    expect(siteCoverage(every2(0, 30), input)).toBeCloseTo(1, 5);
    expect(siteCoverage([at(10)], input)).toBeCloseTo(2 / 30, 5);
    expect(siteCoverage([], input)).toBe(0);
  });
});

describe('visitProof with the customer answer (Duty Day step 6)', () => {
  it('Yes verifies a visit the route doubts, or one with no location', () => {
    const short = visit({ checkOutAt: at(5).recordedAt, points: every2(0, 4) });
    expect(visitProof(short).proof).toBe('doubtful');
    expect(visitProof({ ...short, customerSaid: 'yes' })).toEqual({
      proof: 'verified',
      reasons: [],
    });
    const nowhere = visit({ points: [], checkInLocated: false });
    expect(visitProof({ ...nowhere, customerSaid: 'yes' }).proof).toBe('verified');
  });

  it('Yes never covers fake GPS', () => {
    const faked = visit({ points: [...every2(0, 30), at(15, 0, true)], customerSaid: 'yes' });
    expect(visitProof(faked)).toEqual({ proof: 'doubtful', reasons: ['fake_gps'] });
  });

  it('No makes even a clean visit doubtful, keeping the route reasons first', () => {
    expect(visitProof(visit({ customerSaid: 'no' }))).toEqual({
      proof: 'doubtful',
      reasons: ['customer_said_no'],
    });
    const far = visit({ checkInFar: true, customerSaid: 'no' });
    expect(visitProof(far).reasons).toEqual(['far_check_in', 'customer_said_no']);
    const nowhere = visit({ points: [], checkInLocated: false, customerSaid: 'no' });
    expect(visitProof(nowhere).reasons).toEqual(['customer_said_no']);
  });

  it('no answer keeps the route proof', () => {
    expect(visitProof(visit({ customerSaid: null }))).toEqual(visitProof(visit()));
  });
});
