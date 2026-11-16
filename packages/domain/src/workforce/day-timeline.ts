import { type GapReason, gapReason } from './duty-alert-rules';
import { ROUTE_GAP_MINUTES, type RoutePoint, routeKm } from './route-km';
import type { Stop } from './stops';
import type { VisitProofReason, VisitProofValue } from './visit-proof';

/**
 * A person's duty day as one ordered list (Duty Day step 5): stops, travel, site visits and
 * gaps. Pure: the caller hands over the day's kept points (time order), its stops and visits.
 */

/** Most points sent for the replay; more are thinned evenly. */
export const REPLAY_MAX_POINTS = 1500;

export interface TimelinePoint extends RoutePoint {
  readonly batteryPercent: number | null;
  readonly charging: boolean | null;
  readonly network: string | null;
}

export interface TimelineVisit {
  readonly id: string;
  readonly startAt: Date;
  /** Null while the visit is open; the timeline ends it at the day's end. */
  readonly endAt: Date | null;
  readonly label: string;
  readonly siteLabel: string | null;
  readonly proof: VisitProofValue | null;
  readonly proofReasons: readonly VisitProofReason[];
}

interface Span {
  readonly startAt: Date;
  readonly endAt: Date;
  readonly minutes: number;
}

export type TimelineSegment =
  | (Span & { readonly kind: 'stop'; readonly stop: Stop })
  | (Span & { readonly kind: 'travel'; readonly km: number })
  | (Span & { readonly kind: 'visit'; readonly visit: TimelineVisit })
  | (Span & { readonly kind: 'gap'; readonly reason: GapReason });

export interface DayTimeline {
  readonly segments: readonly TimelineSegment[];
  readonly gapMinutes: number;
  readonly unknownStopMinutes: number;
}

const minutes = (from: Date, to: Date) =>
  Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
const span = (startAt: Date, endAt: Date): Span => ({
  startAt,
  endAt,
  minutes: minutes(startAt, endAt),
});
const overlaps = (a: Span, b: Span) => a.startAt < b.endAt && b.startAt < a.endAt;
const roundKm = (metres: number) => Math.round(metres / 100) / 10;

/** Silences over 20 minutes: from duty start to the first point, between points, to the end. */
export function dayGaps(
  points: readonly TimelinePoint[],
  window: { readonly start: Date; readonly end: Date },
  locationOn: boolean,
): (Span & { readonly kind: 'gap'; readonly reason: GapReason })[] {
  const gaps: (Span & { kind: 'gap'; reason: GapReason })[] = [];
  const add = (from: Date, to: Date, last: TimelinePoint | null) => {
    if ((to.getTime() - from.getTime()) / 60_000 > ROUTE_GAP_MINUTES)
      gaps.push({ kind: 'gap', ...span(from, to), reason: gapReason(last, locationOn) });
  };
  let heard: Date = window.start;
  let last: TimelinePoint | null = null;
  for (const point of points) {
    add(heard, point.recordedAt, last);
    heard = point.recordedAt;
    last = point;
  }
  add(heard, window.end, last);
  return gaps;
}

/** The points between two moments, with the one just before so the leg starts where they were. */
function legPoints(points: readonly TimelinePoint[], from: Date, to: Date): TimelinePoint[] {
  const before = points.filter((point) => point.recordedAt <= from).at(-1);
  const inside = points.filter((point) => point.recordedAt > from && point.recordedAt <= to);
  return before ? [before, ...inside] : inside;
}

/**
 * Visits come first; a gap is shown unless it falls in a visit (the visit's proof tells that
 * story); a stop is shown unless it falls in a visit or a gap. The time between them is
 * travel, measured along the points like the day's km. Totals count what is shown.
 */
export function dayTimeline(input: {
  readonly start: Date;
  /** The check-out, or now (capped) while the day is open. */
  readonly end: Date;
  readonly points: readonly TimelinePoint[];
  readonly stops: readonly Stop[];
  readonly visits: readonly TimelineVisit[];
  readonly locationOn: boolean;
}): DayTimeline {
  const visits = input.visits.map((visit) => ({
    kind: 'visit' as const,
    ...span(visit.startAt, visit.endAt ?? input.end),
    visit,
  }));
  const gaps = dayGaps(input.points, input, input.locationOn).filter(
    (gap) => !visits.some((visit) => overlaps(gap, visit)),
  );
  const stops = input.stops
    .map((stop) => ({ kind: 'stop' as const, ...span(stop.startAt, stop.endAt), stop }))
    .filter((stop) => ![...visits, ...gaps].some((other) => overlaps(stop, other)));
  const main: TimelineSegment[] = [...visits, ...gaps, ...stops].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime(),
  );
  const segments: TimelineSegment[] = [];
  let cursor = input.start;
  const travel = (to: Date) => {
    if (minutes(cursor, to) < 1) return;
    const metres = routeKm(legPoints(input.points, cursor, to)).routeM;
    segments.push({ kind: 'travel', ...span(cursor, to), km: roundKm(metres) });
  };
  for (const segment of main) {
    travel(segment.startAt);
    segments.push(segment);
    if (segment.endAt > cursor) cursor = segment.endAt;
  }
  travel(input.end);
  const sum = (kind: 'gap' | 'stop', test: (segment: TimelineSegment) => boolean = () => true) =>
    segments
      .filter((segment) => segment.kind === kind && test(segment))
      .reduce((total, segment) => total + segment.minutes, 0);
  return {
    segments,
    gapMinutes: sum('gap'),
    unknownStopMinutes: sum('stop', (segment) =>
      segment.kind === 'stop' ? segment.stop.place === 'unknown' : false,
    ),
  };
}

/** At most `max` items, evenly spread, always keeping the first and the last. */
export function thinEvenly<T>(items: readonly T[], max: number = REPLAY_MAX_POINTS): T[] {
  if (items.length <= max) return [...items];
  if (max < 2) return items.slice(-max);
  const step = (items.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, index) => items[Math.round(index * step)] as T);
}
