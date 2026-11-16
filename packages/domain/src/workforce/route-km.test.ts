import { describe, expect, it } from 'vitest';
import { keptEnds, type RoutePoint, routeKm } from './route-km';

const start = new Date('2026-11-16T04:00:00Z').getTime();
/** One degree of latitude is about 111,195 m. */
const DEG_PER_KM = 1 / 111.195;
const pt = (minute: number, km: number, over: Partial<RoutePoint> = {}): RoutePoint => ({
  recordedAt: new Date(start + minute * 60_000),
  latitude: 16.85 + km * DEG_PER_KM,
  longitude: 74.58,
  accuracyM: 10,
  mocked: false,
  ...over,
});

describe('routeKm', () => {
  it('adds the legs of a clean drive', () => {
    const out = routeKm([pt(0, 0), pt(5, 2), pt(10, 4), pt(15, 6)]);
    expect(out.routeM).toBeGreaterThan(5990);
    expect(out.routeM).toBeLessThan(6010);
    expect(out).toMatchObject({ gapCount: 0, gapMinutes: 0, mockedCount: 0, keptPoints: 4 });
    expect(out.droppedPoints).toBe(0);
  });

  it('is empty with no points and zero with one', () => {
    expect(routeKm([])).toMatchObject({ routeM: 0, keptPoints: 0, droppedPoints: 0 });
    expect(routeKm([pt(0, 0)])).toMatchObject({ routeM: 0, keptPoints: 1 });
  });

  it('drops a point with accuracy worse than 100 m, keeps one at exactly 100 m', () => {
    const out = routeKm([pt(0, 0), pt(2, 1, { accuracyM: 101 }), pt(4, 2, { accuracyM: 100 })]);
    expect(out.keptPoints).toBe(2);
    expect(out.droppedPoints).toBe(1);
  });

  it('keeps a point with no accuracy figure', () => {
    expect(routeKm([pt(0, 0), pt(5, 1, { accuracyM: null })]).keptPoints).toBe(2);
  });

  it('drops mocked points and counts them apart', () => {
    const out = routeKm([
      pt(0, 0),
      pt(3, 1, { mocked: true }),
      pt(6, 2, { mocked: true }),
      pt(9, 3),
    ]);
    expect(out.mockedCount).toBe(2);
    expect(out.keptPoints).toBe(2);
    expect(out.droppedPoints).toBe(2);
  });

  it('drops a teleport above 150 km/h and goes on from the last good point', () => {
    // 50 km in one minute is 3,000 km/h.
    const out = routeKm([pt(0, 0), pt(1, 50), pt(5, 2)]);
    expect(out.keptPoints).toBe(2);
    expect(out.routeM).toBeGreaterThan(1990);
    expect(out.routeM).toBeLessThan(2010);
  });

  it('keeps a fast but possible drive (120 km/h)', () => {
    expect(routeKm([pt(0, 0), pt(5, 10)]).keptPoints).toBe(2);
  });

  it('adds nearly nothing for a person standing still', () => {
    // Wobble of about 11 m between readings, for an hour.
    const wobble = Array.from({ length: 30 }, (_, index) => pt(index * 2, (index % 2) * 0.011));
    const out = routeKm(wobble);
    expect(out.routeM).toBe(0);
    expect(out.keptPoints).toBe(30);
  });

  it('uses the larger of 25 m and the mean accuracy as the jitter limit', () => {
    // 40 m move: counted at 10 m accuracy, jitter at 60 m accuracy.
    expect(routeKm([pt(0, 0), pt(2, 0.04)]).routeM).toBeGreaterThan(30);
    expect(routeKm([pt(0, 0, { accuracyM: 60 }), pt(2, 0.04, { accuracyM: 60 })]).routeM).toBe(0);
  });

  it('records a gap over 20 minutes and bridges it with a straight line', () => {
    const out = routeKm([pt(0, 0), pt(5, 1), pt(50, 8), pt(55, 9)]);
    expect(out.gapCount).toBe(1);
    expect(out.gapMinutes).toBe(45);
    expect(out.routeM).toBeGreaterThan(8990);
    expect(out.routeM).toBeLessThan(9010);
  });

  it('does not call exactly 20 minutes a gap', () => {
    expect(routeKm([pt(0, 0), pt(20, 5)]).gapCount).toBe(0);
    expect(routeKm([pt(0, 0), pt(21, 5)]).gapCount).toBe(1);
  });

  it('measures a gap from the last kept point, past dropped ones', () => {
    const out = routeKm([pt(0, 0), pt(10, 3, { mocked: true }), pt(30, 4)]);
    expect(out.gapCount).toBe(1);
    expect(out.gapMinutes).toBe(30);
  });

  it('sums several gaps', () => {
    const out = routeKm([pt(0, 0), pt(25, 2), pt(30, 3), pt(60, 5)]);
    expect(out.gapCount).toBe(2);
    expect(out.gapMinutes).toBe(55);
  });

  it('counts the silence from check-in to the first point and from the last point to check-out', () => {
    const at = (minute: number) => new Date(start + minute * 60_000);
    const out = routeKm([pt(30, 0), pt(35, 1), pt(40, 2)], { from: at(0), to: at(75) });
    expect(out.gapCount).toBe(2);
    expect(out.gapMinutes).toBe(30 + 35);
    // No distance is made up for a stretch with no points.
    expect(out.routeM).toBeGreaterThan(1990);
    expect(out.routeM).toBeLessThan(2010);
  });

  it('does not call 20 minutes at either end a gap, and ignores an open day’s missing end', () => {
    const at = (minute: number) => new Date(start + minute * 60_000);
    expect(routeKm([pt(20, 0), pt(25, 1)], { from: at(0), to: at(45) }).gapCount).toBe(0);
    expect(routeKm([pt(25, 0), pt(30, 1)], { from: at(0), to: null }).gapCount).toBe(1);
  });

  it('reads no end gaps when there is no kept point', () => {
    const at = (minute: number) => new Date(start + minute * 60_000);
    expect(routeKm([], { from: at(0), to: at(600) }).gapCount).toBe(0);
  });

  describe('a bad first point', () => {
    // The first fix is 40 km away; the next readings all agree with each other.
    const bad = pt(0, 40);
    const real = [pt(5, 0), pt(10, 1), pt(15, 2), pt(20, 3)];

    it('starts the route from the readings that agree, and drops the bad anchor', () => {
      const out = routeKm([bad, ...real]);
      expect(out.keptPoints).toBe(4);
      expect(out.droppedPoints).toBe(1);
      expect(out.routeM).toBeGreaterThan(2990);
      expect(out.routeM).toBeLessThan(3010);
    });

    it('needs three readings that agree before it drops the first one', () => {
      const out = routeKm([bad, ...real.slice(0, 2)]);
      expect(out.keptPoints).toBe(1);
      expect(out.droppedPoints).toBe(2);
    });

    it('does not drop the first point when the later readings do not agree with each other', () => {
      const scattered = [pt(5, 0), pt(6, 30), pt(7, 0), pt(8, 30)];
      const out = routeKm([pt(0, 15), ...scattered]);
      expect(out.keptPoints).toBeGreaterThanOrEqual(1);
      expect(out.keptPoints).not.toBe(4);
    });

    it('keeps a normal first point', () => {
      expect(routeKm([pt(0, 0), ...real]).droppedPoints).toBe(0);
    });
  });
});

describe('keptEnds', () => {
  const p = (minute: number, over: Partial<RoutePoint> = {}): RoutePoint => ({
    recordedAt: new Date(Date.UTC(2026, 10, 16, 4, minute)),
    latitude: 19 + minute * 0.0005,
    longitude: 72.8,
    accuracyM: 10,
    mocked: false,
    ...over,
  });

  it('skips mocked and vague points at either end', () => {
    const { first, last } = keptEnds([
      p(0, { mocked: true }),
      p(1),
      p(5),
      p(9),
      p(10, { accuracyM: 500 }),
    ]);
    expect(first?.recordedAt).toEqual(p(1).recordedAt);
    expect(last?.recordedAt).toEqual(p(9).recordedAt);
  });

  it('is empty without usable points', () => {
    expect(keptEnds([p(0, { mocked: true })])).toEqual({ first: null, last: null });
  });
});
