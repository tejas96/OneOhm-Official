import { describe, expect, it } from 'vitest';
import { demoPath } from './demo';
import { fenceEvents } from './fence';
import { distanceM, type LatLng, offsetM } from './geo';
import { cumulative, parseWaypoints, positionAt } from './path';
import { applyProblems, batches, decorate, motion, resample, simulate } from './simulate';

const ORIGIN: LatLng = { latitude: 16.85, longitude: 74.58 };
const straight = (metres: number) => [ORIGIN, offsetM(ORIGIN, metres, 0)];

describe('walking a path', () => {
  it('positionAt follows the line and its bearing', () => {
    const line = straight(1000);
    const cum = cumulative(line);
    expect(cum[1]).toBeGreaterThan(995);
    const mid = positionAt(line, cum, 500);
    expect(distanceM(mid.at, ORIGIN)).toBeCloseTo(500, -1);
    expect(mid.heading).toBeCloseTo(0, 0);
  });

  it('parseWaypoints reads the * site marker', () => {
    const parsed = parseWaypoints('16.1,74.1;*16.2,74.2;16.3,74.3');
    expect(parsed.star).toBe(1);
    expect(parsed.waypoints[2]).toEqual({ latitude: 16.3, longitude: 74.3 });
    expect(() => parseWaypoints('16.1,74.1')).toThrow();
    expect(() => parseWaypoints('x,y;1,2')).toThrow();
  });
});

describe('resampling at 120 s or 100 m', () => {
  it('moving fast: a point about every 100 m, never more than 120 s apart', () => {
    const path = {
      line: straight(3000),
      waypoints: [ORIGIN, offsetM(ORIGIN, 1500, 0)],
      siteIndex: 1,
      source: 't',
    };
    const m = motion(path, 25, 0);
    const points = resample(m);
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      if (!a || !b) throw new Error('missing point');
      expect(b.tSec - a.tSec).toBeLessThanOrEqual(120);
      // The last reading may come sooner (the end of the path); all others reach 100 m.
      if (i < points.length - 1) expect(distanceM(a.at, b.at)).toBeGreaterThanOrEqual(99);
    }
    expect(points[0]?.tSec).toBe(0);
    expect(points[points.length - 1]?.tSec).toBeCloseTo(m.totalSec, 0);
  });

  it('standing still: one point every 120 s', () => {
    const still = {
      totalSec: 600,
      at: (tSec: number) => ({ tSec, at: ORIGIN, speedMps: 0, heading: null }),
    };
    expect(resample(still).map((p) => p.tSec)).toEqual([0, 120, 240, 360, 480, 600]);
  });

  it('slow walking: the 120 s rule wins over 100 m', () => {
    const slow = {
      totalSec: 360,
      at: (tSec: number) => ({
        tSec,
        at: offsetM(ORIGIN, tSec * 0.2, 0),
        speedMps: 0.2,
        heading: 0,
      }),
    };
    expect(resample(slow).map((p) => p.tSec)).toEqual([0, 120, 240, 360]);
  });
});

describe('the dwell at the site', () => {
  const path = demoPath();
  const m = motion(path, 25, 12);

  it('lasts the asked minutes and stands still at the site', () => {
    expect(m.leaveSec - m.arriveSec).toBeCloseTo(12 * 60, 6);
    const inside = m.at(m.arriveSec + 60);
    expect(inside.speedMps).toBe(0);
    expect(inside.heading).toBeNull();
    expect(distanceM(inside.at, path.waypoints[path.siteIndex] as LatLng)).toBeLessThan(15);
  });

  it('gives stationary points every 2 minutes with noise but near the site', () => {
    const sim = simulate(path, { speedKmh: 25, dwellMin: 12, startMs: 0, seed: 7 });
    const during = sim.points.filter((p) => p.tSec >= sim.arriveSec && p.tSec < sim.leaveSec);
    expect(during.length).toBeGreaterThanOrEqual(5);
    for (const p of during) {
      expect(distanceM(p.body, sim.site)).toBeLessThan(60);
      expect(p.body.accuracyM).toBeGreaterThanOrEqual(6);
      expect(p.body.accuracyM).toBeLessThanOrEqual(25);
    }
    expect(new Set(during.map((p) => `${p.body.latitude}`)).size).toBeGreaterThan(1);
  });

  it('is repeatable with a seed, and battery only goes down', () => {
    const a = simulate(path, { speedKmh: 25, dwellMin: 12, startMs: 0, seed: 3 }).points.map(
      (p) => p.body.latitude,
    );
    const b = simulate(path, { speedKmh: 25, dwellMin: 12, startMs: 0, seed: 3 }).points.map(
      (p) => p.body.latitude,
    );
    expect(a).toEqual(b);
    const battery = simulate(path, { speedKmh: 25, dwellMin: 12, startMs: 0, seed: 3 }).points.map(
      (p) => p.body.batteryPercent,
    );
    expect([...battery].sort((x, y) => y - x)).toEqual(battery);
  });
});

describe('problem days', () => {
  const cfg = { speedKmh: 25, dwellMin: 12, startMs: 0, seed: 1 };
  const base = () => decorate(resample(motion(demoPath(), 25, 12)), cfg);

  it('drops the points in a gap window', () => {
    const { points, dropped } = applyProblems(base(), { ...cfg, gap: [4, 9] });
    expect(dropped).toBeGreaterThan(0);
    expect(points.some((p) => p.tSec >= 240 && p.tSec < 540)).toBe(false);
  });

  it('marks one fake point, one 20 km jump and one 300 m accuracy', () => {
    const all = base();
    const { points } = applyProblems(all, { ...cfg, fake: 10, jump: 12, badAccuracy: 14 });
    expect(points.filter((p) => p.body.mocked)).toHaveLength(1);
    expect(points.filter((p) => p.body.accuracyM === 300)).toHaveLength(1);
    const jumped = points.filter((p) => distanceM(p.body, p.truth) > 15_000);
    expect(jumped).toHaveLength(1);
  });

  it('cuts the upload into batches of at most 200', () => {
    expect(batches(Array.from({ length: 450 }, (_, i) => i)).map((b) => b.length)).toEqual([
      200, 200, 50,
    ]);
  });
});

describe('the phone fence', () => {
  it('confirms after 5 minutes inside, and exits at the first reading outside', () => {
    const sim = simulate(demoPath(), { speedKmh: 25, dwellMin: 12, startMs: 0, seed: 5 });
    const events = fenceEvents(sim.points, sim.site, 150);
    const enter = events.enter;
    expect(enter).not.toBeNull();
    const confirm = sim.points[enter?.confirmIndex ?? 0];
    const first = sim.points.find((p) => p.body.recordedAt === enter?.enteredAt);
    expect((confirm?.tSec ?? 0) - (first?.tSec ?? 0)).toBeGreaterThanOrEqual(300);
    const out = sim.points[events.exit?.index ?? 0];
    expect(out?.tSec).toBeGreaterThanOrEqual(sim.leaveSec);
  });

  it('sends nothing for a drive-past', () => {
    const sim = simulate(demoPath(), { speedKmh: 25, dwellMin: 0, startMs: 0, seed: 5 });
    expect(fenceEvents(sim.points, sim.site, 150).enter).toBeNull();
  });
});
