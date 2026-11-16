import type { DutyDay, DutyDaySegment } from '@oneohm/api-contracts';

/**
 * The replay's clock. At 1× a minute of the day passes each second (an 8 hour day plays in 8
 * minutes); 4× and 16× are quicker. Times are epoch ms of the day itself.
 */
export const SPEEDS = [1, 4, 16] as const;
export type Speed = (typeof SPEEDS)[number];
/** Day ms per real ms at 1×: a minute a second. */
export const DAY_MS_PER_MS = 60;

export interface ReplayPoint {
  readonly t: number;
  readonly lat: number;
  readonly lng: number;
}

export const toReplayPoints = (points: DutyDay['points']): ReplayPoint[] =>
  points.map((point) => ({
    t: new Date(point.at).getTime(),
    lat: point.latitude,
    lng: point.longitude,
  }));

/** The span the replay covers: duty start (or the first point) to its end (or the last point or now). */
export function replaySpan(day: DutyDay, now: number): { start: number; end: number } | null {
  const times = [
    ...(day.duty ? [new Date(day.duty.startedAt).getTime()] : []),
    ...day.points.map((point) => new Date(point.at).getTime()),
    ...day.segments.flatMap((segment) => [
      new Date(segment.startAt).getTime(),
      new Date(segment.endAt).getTime(),
    ]),
  ];
  if (times.length === 0) return null;
  const start = Math.min(...times);
  const ended = day.duty?.endedAt ? new Date(day.duty.endedAt).getTime() : null;
  const end = Math.max(ended ?? Math.min(now, Math.max(...times)), ...times);
  return end > start ? { start, end } : null;
}

/** The time after `dtMs` of real time at a speed, never past the end. */
export const advance = (t: number, dtMs: number, speed: Speed, end: number) =>
  Math.min(end, t + dtMs * DAY_MS_PER_MS * speed);

/** How long the rest of the day takes to play at a speed, in real seconds. */
export const playSeconds = (t: number, end: number, speed: Speed) =>
  Math.max(0, (end - t) / (DAY_MS_PER_MS * speed) / 1000);

/** 0 to 1 along the span, for the scrub bar. */
export const fractionOf = (t: number, span: { start: number; end: number }) =>
  span.end <= span.start ? 0 : Math.min(1, Math.max(0, (t - span.start) / (span.end - span.start)));

/** The time at a fraction of the span (the scrub bar dragged). */
export const timeAt = (fraction: number, span: { start: number; end: number }) =>
  span.start + Math.min(1, Math.max(0, fraction)) * (span.end - span.start);

/** The index of the last point at or before `t` (binary search); -1 before the first. */
export function pointIndexAt(points: readonly ReplayPoint[], t: number): number {
  let low = 0;
  let high = points.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((points[middle]?.t ?? 0) <= t) {
      found = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return found;
}

/**
 * Where the person was at `t`: between the two points around it, in proportion to the time.
 * Before the first point it is the first; after the last, the last. During a gap (no points)
 * the marker waits at the last place seen rather than sliding across it.
 */
export function positionAt(
  points: readonly ReplayPoint[],
  t: number,
  gapMs = 10 * 60_000,
): { lat: number; lng: number } | null {
  if (points.length === 0) return null;
  const index = pointIndexAt(points, t);
  const before = points[Math.max(0, index)];
  const after = points[index + 1];
  if (!before) return null;
  if (index < 0 || !after) return { lat: before.lat, lng: before.lng };
  const span = after.t - before.t;
  if (span <= 0 || span > gapMs) return { lat: before.lat, lng: before.lng };
  const k = (t - before.t) / span;
  return {
    lat: before.lat + (after.lat - before.lat) * k,
    lng: before.lng + (after.lng - before.lng) * k,
  };
}

/** The segment the replay is in at `t`, by index; -1 when outside every segment. */
export function segmentIndexAt(segments: readonly DutyDaySegment[], t: number): number {
  return segments.findIndex(
    (segment) => new Date(segment.startAt).getTime() <= t && t < new Date(segment.endAt).getTime(),
  );
}

/** Where each segment starts on the scrub bar (0 to 1), with its kind, for the ticks. */
export function segmentTicks(
  segments: readonly DutyDaySegment[],
  span: { start: number; end: number },
): { fraction: number; width: number; kind: DutyDaySegment['kind']; flagged: boolean }[] {
  return segments.map((segment) => {
    const from = fractionOf(new Date(segment.startAt).getTime(), span);
    const to = fractionOf(new Date(segment.endAt).getTime(), span);
    return {
      fraction: from,
      width: Math.max(0, to - from),
      kind: segment.kind,
      flagged: segment.kind === 'stop' && segment.flagged,
    };
  });
}
