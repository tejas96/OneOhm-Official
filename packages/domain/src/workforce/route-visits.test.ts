import { describe, expect, it } from 'vitest';
import type { DutySite } from './duty-sites';
import { type RouteVisitPoint, routeVisitActions } from './route-visits';

const site: DutySite = {
  id: 't1',
  kind: 'installation',
  label: 'Sharma home',
  latitude: 16.85,
  longitude: 74.58,
  radiusM: 150,
};
const other: DutySite = { ...site, id: 't2', label: 'Patil home', latitude: 16.9, longitude: 74.7 };
const at = (time: string) => new Date(`2026-11-16T${time}:00+05:30`);
/** About 11 m per 0.0001 degree of latitude. */
const near = { latitude: 16.85, longitude: 74.58 };
const far = { latitude: 16.86, longitude: 74.58 };
const pt = (
  time: string,
  where: { latitude: number; longitude: number },
  patch: Partial<RouteVisitPoint> = {},
): RouteVisitPoint => ({
  recordedAt: at(time),
  ...where,
  accuracyM: 20,
  mocked: false,
  ...patch,
});
const none = { open: null, closedAt: null, closedBySite: new Map<string, Date>() };
const run = (
  points: RouteVisitPoint[],
  extra: Partial<Parameters<typeof routeVisitActions>[0]> = {},
) => routeVisitActions({ points, sites: [site, other], ...none, ...extra });

describe('routeVisitActions, arriving', () => {
  it('checks in at the first inside point once three points span five minutes', () => {
    const actions = run([
      pt('10:00', far),
      pt('10:42', near),
      pt('10:45', near),
      pt('10:48', near),
      pt('10:51', near),
    ]);
    expect(actions).toEqual([{ kind: 'check_in', site, at: at('10:42') }]);
  });
  it('does not check in a drive-past: two points four minutes apart', () => {
    expect(run([pt('10:42', near), pt('10:46', near)])).toEqual([]);
    expect(run([pt('10:42', near)])).toEqual([]);
  });
  it('needs the five minutes too, not just three points', () => {
    expect(run([pt('10:42', near), pt('10:44', near), pt('10:46', near)])).toEqual([]);
    expect(run([pt('10:42', near), pt('10:45', near), pt('10:47', near)])).toHaveLength(1);
  });
  it('does not join points more than six minutes apart', () => {
    expect(run([pt('10:42', near), pt('10:49', near), pt('10:56', near)])).toEqual([]);
    // The run starts again after the silence.
    expect(
      run([pt('10:30', near), pt('10:42', near), pt('10:45', near), pt('10:48', near)]),
    ).toEqual([{ kind: 'check_in', site, at: at('10:42') }]);
  });
  it('breaks the run at a fake or inexact point, or one outside', () => {
    const rest = [pt('10:44', near), pt('10:48', near)];
    expect(run([pt('10:42', near), pt('10:43', near, { mocked: true }), ...rest])).toEqual([]);
    expect(run([pt('10:42', near), pt('10:43', near, { accuracyM: 250 }), ...rest])).toEqual([]);
    expect(run([pt('10:42', near), pt('10:43', far), ...rest])).toEqual([]);
    expect(run([pt('10:42', near), pt('10:43', near, { accuracyM: null }), ...rest])).toEqual([]);
  });
  it('ignores points near nothing the person works at today', () => {
    const away = { latitude: 17.2, longitude: 75 };
    expect(run([pt('10:00', away), pt('10:03', away), pt('10:06', away)])).toEqual([]);
  });
  it('does not guess between two sites whose fences overlap', () => {
    const twin: DutySite = { ...site, id: 't3', label: 'Next door', latitude: 16.8505 };
    const here = { latitude: 16.8502, longitude: 74.58 };
    const points = [pt('10:00', here), pt('10:03', here), pt('10:06', here)];
    expect(run(points, { sites: [site, twin] })).toEqual([]);
    expect(run(points, { sites: [site] })).toHaveLength(1);
  });
});

describe('routeVisitActions, leaving', () => {
  const open = { siteId: 't1', checkInAt: at('10:42'), site: { ...near }, radiusM: 150 };
  it('checks out only after the person was seen inside during the visit', () => {
    expect(run([pt('11:30', far), pt('11:36', far)], { open })).toEqual([]);
    expect(run([pt('10:30', far), pt('10:36', far)], { open })).toEqual([]);
  });
  it('checks out at the first outside point of a run beyond radius plus 100 m', () => {
    const actions = run([pt('11:10', near), pt('11:30', far), pt('11:36', far)], { open });
    expect(actions).toEqual([{ kind: 'check_out', at: at('11:30') }]);
  });
  it('does not check out on one far point or points just past the fence', () => {
    expect(run([pt('11:10', near), pt('11:30', far)], { open })).toEqual([]);
    const edge = { latitude: 16.8518, longitude: 74.58 };
    expect(run([pt('11:10', near), pt('11:30', edge), pt('11:40', edge)], { open })).toEqual([]);
  });
  it('leaves a visit with no saved pin to the person', () => {
    expect(run([pt('11:30', far), pt('11:40', far)], { open: { ...open, site: null } })).toEqual(
      [],
    );
  });
});

describe('routeVisitActions, a whole day in one flush', () => {
  it('gives each arrival and departure in order', () => {
    const farther = { latitude: 16.9, longitude: 74.7 };
    const actions = run([
      pt('10:00', near),
      pt('10:03', near),
      pt('10:06', near),
      pt('10:30', far),
      pt('10:36', far),
      pt('11:00', farther),
      pt('11:03', farther),
      pt('11:06', farther),
    ]);
    expect(actions).toEqual([
      { kind: 'check_in', site, at: at('10:00') },
      { kind: 'check_out', at: at('10:30') },
      { kind: 'check_in', site: other, at: at('11:00') },
    ]);
  });
  it('does not check in again at a site closed by hand while the person stands there', () => {
    const closed = new Map([['t1', at('10:20')]]);
    expect(
      run([pt('10:00', near), pt('10:25', near), pt('10:28', near), pt('10:31', near)], {
        closedAt: at('10:20'),
        closedBySite: closed,
      }),
    ).toEqual([]);
  });
  it('checks in again after the person went away and came back', () => {
    const closed = new Map([['t1', at('10:20')]]);
    const actions = run(
      [pt('10:30', far), pt('11:00', near), pt('11:03', near), pt('11:06', near)],
      {
        closedAt: at('10:20'),
        closedBySite: closed,
      },
    );
    expect(actions).toEqual([{ kind: 'check_in', site, at: at('11:00') }]);
  });
  it('is the same on the next upload once the visit is saved', () => {
    expect(
      run([pt('10:00', near), pt('10:03', near), pt('10:06', near)], {
        open: { siteId: 't1', checkInAt: at('10:00'), site: { ...near }, radiusM: 150 },
      }),
    ).toEqual([]);
  });
});
