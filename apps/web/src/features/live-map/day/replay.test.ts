import type { DutyDay, DutyDaySegment } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import {
  advance,
  DAY_MS_PER_MS,
  fractionOf,
  playSeconds,
  pointIndexAt,
  positionAt,
  replaySpan,
  segmentIndexAt,
  segmentTicks,
  timeAt,
  toReplayPoints,
} from './replay';

const at = (clock: string) => `2026-11-16T${clock}:00.000Z`;
const ms = (clock: string) => new Date(at(clock)).getTime();
const point = (clock: string, latitude: number, longitude = 74) => ({
  at: at(clock),
  latitude,
  longitude,
});

const travel = (from: string, to: string): DutyDaySegment => ({
  kind: 'travel',
  startAt: at(from),
  endAt: at(to),
  minutes: (ms(to) - ms(from)) / 60_000,
  km: 1,
});
const stop = (from: string, to: string): DutyDaySegment => ({
  kind: 'stop',
  startAt: at(from),
  endAt: at(to),
  minutes: (ms(to) - ms(from)) / 60_000,
  centre: { latitude: 16, longitude: 74 },
  place: 'unknown',
  placeLabel: null,
  flagged: true,
});

const day = (over: Partial<DutyDay> = {}): DutyDay => ({
  userId: 'u1',
  date: '2026-11-16',
  duty: { startedAt: at('04:00'), endedAt: at('08:00') },
  locationOn: true,
  segments: [travel('04:00', '05:00'), stop('05:00', '06:00'), travel('06:00', '08:00')],
  totals: {
    routeKm: 2,
    paidKm: null,
    hoursOnDuty: 4,
    visits: 0,
    unknownStopMinutes: 60,
    gapMinutes: 0,
  },
  points: [point('04:00', 16), point('04:10', 16.1), point('05:00', 16.2)],
  ...over,
});

describe('replay clock', () => {
  it('spans duty start to duty end, else to the last thing recorded or now', () => {
    expect(replaySpan(day(), ms('12:00'))).toEqual({ start: ms('04:00'), end: ms('08:00') });
    const open = day({ duty: { startedAt: at('04:00'), endedAt: null } });
    expect(replaySpan(open, ms('12:00'))?.end).toBe(ms('08:00'));
    expect(replaySpan(day({ duty: null, segments: [], points: [] }), 0)).toBeNull();
  });

  it('plays a minute of the day each second at 1×, faster at 4× and 16×, and stops at the end', () => {
    expect(DAY_MS_PER_MS).toBe(60);
    expect(advance(ms('04:00'), 1000, 1, ms('08:00'))).toBe(ms('04:01'));
    expect(advance(ms('04:00'), 1000, 16, ms('08:00'))).toBe(ms('04:16'));
    expect(advance(ms('07:59'), 10_000, 4, ms('08:00'))).toBe(ms('08:00'));
    // Four hours at 4×: 60 real seconds.
    expect(playSeconds(ms('04:00'), ms('08:00'), 4)).toBe(60);
  });

  it('maps the scrub bar to time and back, clamped', () => {
    const span = { start: ms('04:00'), end: ms('08:00') };
    expect(fractionOf(ms('06:00'), span)).toBe(0.5);
    expect(fractionOf(ms('09:00'), span)).toBe(1);
    expect(timeAt(0.25, span)).toBe(ms('05:00'));
    expect(timeAt(-1, span)).toBe(span.start);
  });
});

describe('replay position', () => {
  const points = toReplayPoints(day().points);

  it('finds the last point at or before a time', () => {
    expect(pointIndexAt(points, ms('03:00'))).toBe(-1);
    expect(pointIndexAt(points, ms('04:10'))).toBe(1);
    expect(pointIndexAt(points, ms('04:30'))).toBe(1);
    expect(pointIndexAt(points, ms('09:00'))).toBe(2);
  });

  it('moves between points in proportion to time and holds before, after and across a gap', () => {
    expect(positionAt(points, ms('04:05'))?.lat).toBeCloseTo(16.05);
    expect(positionAt(points, ms('03:00'))?.lat).toBe(16);
    expect(positionAt(points, ms('09:00'))?.lat).toBe(16.2);
    // 04:10 → 05:00 is a 50 minute gap: the marker waits where it was last seen.
    expect(positionAt(points, ms('04:40'))?.lat).toBe(16.1);
    expect(positionAt([], ms('04:00'))).toBeNull();
  });

  it('knows the segment at a time and places each segment on the bar', () => {
    const { segments } = day();
    expect(segmentIndexAt(segments, ms('05:30'))).toBe(1);
    expect(segmentIndexAt(segments, ms('09:00'))).toBe(-1);
    const ticks = segmentTicks(segments, { start: ms('04:00'), end: ms('08:00') });
    expect(ticks.map((tick) => [tick.fraction, tick.width])).toEqual([
      [0, 0.25],
      [0.25, 0.25],
      [0.5, 0.5],
    ]);
    expect(ticks[1]?.flagged).toBe(true);
  });
});
