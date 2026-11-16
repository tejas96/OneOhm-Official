import { describe, expect, it } from 'vitest';
import {
  type JobToday,
  nextJobToday,
  type OnWayInput,
  onTheWay,
  visitEtaMinutes,
} from './on-the-way';
import type { RoutePoint } from './route-km';

const NOW = new Date('2026-11-16T06:00:00Z');
const DEG_PER_M = 1 / 111_195;
const SITE = { latitude: 16.85, longitude: 74.58 };
/** A point `metres` north of the site, `minutesAgo` before NOW. */
const at = (minutesAgo: number, metres: number, over: Partial<RoutePoint> = {}): RoutePoint => ({
  recordedAt: new Date(NOW.getTime() - minutesAgo * 60_000),
  latitude: SITE.latitude + metres * DEG_PER_M,
  longitude: SITE.longitude,
  accuracyM: 10,
  mocked: false,
  ...over,
});
const input = (points: RoutePoint[], over: Partial<OnWayInput> = {}): OnWayInput => ({
  onDuty: true,
  atSite: false,
  site: SITE,
  radiusM: 150,
  points,
  now: NOW,
  ...over,
});
const approaching = [at(6, 6000), at(4, 5000), at(2, 4000)];

describe('visitEtaMinutes', () => {
  it('is the road (straight × 1.4) at 25 km/h, rounded up to 5 minutes, at least 5', () => {
    expect(visitEtaMinutes(0)).toBe(5);
    expect(visitEtaMinutes(500)).toBe(5);
    // 4 km straight = 5.6 km road = 13.4 min → 15.
    expect(visitEtaMinutes(4000)).toBe(15);
    // Exactly 10 minutes of road stays 10: 25 km/h × 10 min = 4166.67 m road.
    expect(visitEtaMinutes(4166.666 / 1.4)).toBe(10);
    // 13.4 km straight = 45.0 min road; a little more is 50.
    expect(visitEtaMinutes(13_390)).toBe(45);
    expect(visitEtaMinutes(14_000)).toBe(50);
  });
});

describe('onTheWay', () => {
  it('goes when three usable points come closer, fresh, and the ETA is 45 min or less', () => {
    expect(onTheWay(input(approaching))).toEqual({ send: true, minutes: 15, distanceM: 4000 });
  });

  it('stays quiet when moving away, standing still or jittering', () => {
    expect(onTheWay(input([at(6, 4000), at(4, 5000), at(2, 6000)]))).toMatchObject({
      reason: 'not_closer',
    });
    expect(onTheWay(input([at(6, 4000), at(4, 4000), at(2, 4000)]))).toMatchObject({
      reason: 'not_closer',
    });
    expect(onTheWay(input([at(6, 4040), at(4, 4020), at(2, 4000)]))).toMatchObject({
      reason: 'not_closer',
    });
  });

  it('stays quiet when far (ETA over 45 min) or already inside the fence', () => {
    expect(onTheWay(input([at(8, 20_000), at(5, 19_000), at(2, 18_000)]))).toMatchObject({
      reason: 'far',
    });
    expect(onTheWay(input([at(6, 900), at(4, 500), at(2, 100)]))).toMatchObject({
      reason: 'there',
    });
  });

  it('needs three usable points: mocked and vague ones do not count', () => {
    expect(onTheWay(input(approaching.slice(1)))).toMatchObject({ reason: 'few_points' });
    const mocked = [at(6, 6000, { mocked: true }), at(4, 5000), at(2, 4000)];
    expect(onTheWay(input(mocked))).toMatchObject({ reason: 'few_points' });
    const vague = [at(6, 6000, { accuracyM: 500 }), at(4, 5000), at(2, 4000)];
    expect(onTheWay(input(vague))).toMatchObject({ reason: 'few_points' });
    // A usable point before them makes three again, in time order whatever the input order.
    expect(
      onTheWay(input([at(4, 5000), at(8, 7000), at(2, 4000), at(6, 6000, { mocked: true })])),
    ).toMatchObject({ send: true });
  });

  it('stays quiet off duty, at a site, or with old points', () => {
    expect(onTheWay(input(approaching, { onDuty: false }))).toMatchObject({ reason: 'off_duty' });
    expect(onTheWay(input(approaching, { atSite: true }))).toMatchObject({ reason: 'at_site' });
    const old = [at(26, 6000), at(24, 5000), at(22, 4000)];
    expect(onTheWay(input(old))).toMatchObject({ reason: 'stale' });
  });
});

describe('nextJobToday', () => {
  const job = (id: string, over: Partial<JobToday> = {}): JobToday => ({
    id,
    latitude: 16.8,
    longitude: 74.5,
    planned: true,
    startMin: 600,
    arrived: false,
    ...over,
  });

  it('is the earliest planned job not yet reached, with a location', () => {
    const jobs = [
      job('c', { startMin: 900 }),
      job('a', { startMin: 600, arrived: true }),
      job('b', { startMin: 660 }),
      job('d', { startMin: 540, latitude: null }),
      job('e', { planned: false, startMin: null }),
    ];
    expect(nextJobToday(jobs)?.id).toBe('b');
  });

  it('puts untimed planned visits after timed ones, then scheduled work; null when none', () => {
    expect(nextJobToday([job('z', { startMin: null }), job('y', { startMin: 1000 })])?.id).toBe(
      'y',
    );
    expect(nextJobToday([job('s', { planned: false, startMin: null })])?.id).toBe('s');
    expect(nextJobToday([job('x', { arrived: true })])).toBeNull();
  });
});
