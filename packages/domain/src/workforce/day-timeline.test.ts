import { describe, expect, it } from 'vitest';
import { dayTimeline, type TimelinePoint, type TimelineVisit, thinEvenly } from './day-timeline';
import { dayStops } from './stops';

const T0 = new Date('2026-11-16T03:30:00Z');
const DEG_PER_M = 1 / 111_195;
const time = (minute: number) => new Date(T0.getTime() + minute * 60_000);
const at = (minute: number, metresNorth: number, battery = 70): TimelinePoint => ({
  recordedAt: time(minute),
  latitude: 16.85 + metresNorth * DEG_PER_M,
  longitude: 74.58,
  accuracyM: 10,
  mocked: false,
  batteryPercent: battery,
  charging: false,
  network: 'cellular',
});
const run = (from: number, to: number, metres: (minute: number) => number) =>
  Array.from({ length: Math.floor((to - from) / 2) + 1 }, (_, i) =>
    at(from + i * 2, metres(from + i * 2)),
  );

// 0–20 at the office, 20–40 drive 2 km, 40–70 at the site (a visit 42–68), 70–80 drive on,
// 80–130 an unknown stop, silence 130–170 (battery low), 170–180 points, end at 180.
const office = { id: 'o1', name: 'Office', latitude: 16.85, longitude: 74.58, radiusM: 150 };
const site = { id: 'task1', label: 'Sharma home', ...at(0, 2000), radiusM: 150 };
const points = [
  ...run(0, 20, () => 0),
  ...run(22, 38, (m) => (m - 20) * 100),
  ...run(40, 70, () => 2000),
  ...run(72, 78, (m) => 2000 + (m - 70) * 150),
  ...run(80, 128, () => 3500),
  at(130, 3500, 9),
  ...run(170, 180, () => 3500),
];
const visit: TimelineVisit = {
  id: 'v1',
  startAt: time(42),
  endAt: time(68),
  label: 'Site survey',
  siteLabel: 'Sharma home',
  proof: 'verified',
  proofReasons: [],
};
const stops = dayStops(points, { offices: [office], sites: [site], unknownStopMinutes: 45 });
const day = dayTimeline({
  start: time(0),
  end: time(180),
  points,
  stops,
  visits: [visit],
  locationOn: true,
});

describe('dayTimeline', () => {
  it('orders stops, travel, the visit and the gap', () => {
    expect(day.segments.map((segment) => segment.kind)).toEqual([
      'stop',
      'travel',
      'visit',
      'travel',
      'stop',
      'gap',
      'stop',
    ]);
  });

  it('names the stops and leaves out the one inside the visit', () => {
    const named = day.segments.flatMap((segment) => (segment.kind === 'stop' ? [segment] : []));
    expect(named.map((segment) => segment.stop.place)).toEqual(['office', 'unknown', 'unknown']);
    expect(named[1]?.stop.flagged).toBe(true);
  });

  it('measures travel along the points and gives the gap its reason', () => {
    const drive = day.segments[1];
    expect(drive?.kind === 'travel' && drive.km).toBeCloseTo(2, 0);
    const gap = day.segments.find((segment) => segment.kind === 'gap');
    expect(gap).toMatchObject({ minutes: 40, reason: 'low_battery' });
  });

  it('adds up the gaps and the unknown stops it shows', () => {
    expect(day.gapMinutes).toBe(40);
    expect(day.unknownStopMinutes).toBe(50 + 10);
  });

  it('shows the whole day as one gap with no points, location off', () => {
    const empty = dayTimeline({
      start: time(0),
      end: time(60),
      points: [],
      stops: [],
      visits: [],
      locationOn: false,
    });
    expect(empty.segments).toEqual([
      { kind: 'gap', startAt: time(0), endAt: time(60), minutes: 60, reason: 'location_off' },
    ]);
  });

  it('runs an open visit to the end of the day', () => {
    const open = dayTimeline({
      start: time(0),
      end: time(100),
      points: run(0, 100, () => 2000),
      stops: [],
      visits: [{ ...visit, endAt: null }],
      locationOn: true,
    });
    expect(open.segments.at(-1)).toMatchObject({ kind: 'visit', minutes: 58 });
  });
});

describe('thinEvenly', () => {
  it('keeps everything under the limit, else the first, the last and an even spread', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    expect(thinEvenly(items, 20)).toEqual(items);
    expect(thinEvenly(items, 4)).toEqual([0, 3, 6, 9]);
  });
});
