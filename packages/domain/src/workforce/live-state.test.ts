import { describe, expect, it } from 'vitest';
import {
  type LiveFacts,
  type LivePoint,
  liveSiteStatus,
  liveState,
  liveTail,
  mayWatchPerson,
} from './live-state';

const now = new Date('2026-11-16T06:00:00Z');
const DEG_PER_M = 1 / 111_195;
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const pt = (minutesAgo: number, metresNorth: number, speedMps: number | null = 0): LivePoint => ({
  recordedAt: ago(minutesAgo),
  latitude: 16.85 + metresNorth * DEG_PER_M,
  longitude: 74.58,
  speedMps,
});
const facts = (over: Partial<LiveFacts> = {}): LiveFacts => ({
  now,
  onLeave: false,
  dutyStartedAt: ago(120),
  onVisit: false,
  locationOn: true,
  points: [pt(4, 0), pt(2, 10)],
  ...over,
});

describe('liveState', () => {
  it('is off duty with no open day, on leave when approved leave covers today', () => {
    expect(liveState(facts({ dutyStartedAt: null }))).toBe('off_duty');
    expect(liveState(facts({ dutyStartedAt: null, onLeave: true }))).toBe('on_leave');
  });

  it('shows someone on duty on a leave day as on duty (a half day)', () => {
    expect(liveState(facts({ onLeave: true }))).toBe('idle');
  });

  it('is on a visit while a site visit is open, even when the phone is quiet', () => {
    expect(liveState(facts({ onVisit: true, points: [pt(50, 0)] }))).toBe('on_visit');
  });

  it('reads nothing from the points with location off, but still knows duty and visits', () => {
    const off = facts({ locationOn: false, points: [pt(6, 0), pt(1, 400)] });
    expect(liveState(off)).toBe('location_off');
    expect(liveState({ ...off, onVisit: true })).toBe('on_visit');
    expect(liveState({ ...off, dutyStartedAt: null })).toBe('off_duty');
  });

  it('is a gap after 20 minutes with no point, or 20 minutes after check-in with none', () => {
    expect(liveState(facts({ points: [pt(25, 0), pt(21, 400)] }))).toBe('gap');
    expect(liveState(facts({ points: [pt(19, 0)] }))).toBe('idle');
    expect(liveState(facts({ points: [], dutyStartedAt: ago(21) }))).toBe('gap');
    expect(liveState(facts({ points: [], dutyStartedAt: ago(5) }))).toBe('idle');
  });

  it('is moving when the last two points are far apart within 10 minutes', () => {
    expect(liveState(facts({ points: [pt(6, 0), pt(1, 151)] }))).toBe('moving');
    expect(liveState(facts({ points: [pt(6, 0), pt(1, 149)] }))).toBe('idle');
    // Far apart, but 12 minutes apart: not a move.
    expect(liveState(facts({ points: [pt(13, 0), pt(1, 400)] }))).toBe('idle');
  });

  it('is moving when the last speed is over 1.5 m/s', () => {
    expect(liveState(facts({ points: [pt(1, 0, 1.6)] }))).toBe('moving');
    expect(liveState(facts({ points: [pt(1, 0, 1.5)] }))).toBe('idle');
  });
});

describe('liveTail', () => {
  it('keeps the last 30 minutes only', () => {
    const tail = liveTail([pt(40, 0), pt(31, 1), pt(29, 2), pt(1, 3)], now);
    expect(tail.map((point) => point.recordedAt)).toEqual([ago(29), ago(1)]);
  });

  it('thins evenly to the maximum and keeps the newest point', () => {
    const many = Array.from({ length: 60 }, (_, index) => pt(29 - index * 0.48, index));
    const tail = liveTail(many, now, 10);
    expect(tail).toHaveLength(10);
    expect(tail[0]).toBe(many[0]);
    expect(tail[9]).toBe(many[59]);
  });
});

describe('liveSiteStatus', () => {
  const base = { open: false, visitedToday: false, plannedStartMin: 600, nowMin: 540 };
  it('is in progress while open, then done', () => {
    expect(liveSiteStatus({ ...base, open: true, nowMin: 700 })).toBe('in_progress');
    expect(liveSiteStatus({ ...base, visitedToday: true, nowMin: 700 })).toBe('done');
  });
  it('is late once the planned start has passed with nobody there', () => {
    expect(liveSiteStatus(base)).toBe('planned');
    expect(liveSiteStatus({ ...base, nowMin: 601 })).toBe('late');
    expect(liveSiteStatus({ ...base, plannedStartMin: null, nowMin: 1000 })).toBe('planned');
  });
});

describe('mayWatchPerson', () => {
  const ask = (over: Partial<Parameters<typeof mayWatchPerson>[0]>) =>
    mayWatchPerson({
      viewerId: 'm',
      managesPeople: false,
      personId: 'w',
      personManagerId: null,
      ...over,
    });
  it('lets the person, HR and the direct manager watch, nobody else', () => {
    expect(ask({ viewerId: 'w' })).toBe(true);
    expect(ask({ managesPeople: true })).toBe(true);
    expect(ask({ personManagerId: 'm' })).toBe(true);
    expect(ask({ personManagerId: 'someone-else' })).toBe(false);
    expect(ask({})).toBe(false);
  });
});
