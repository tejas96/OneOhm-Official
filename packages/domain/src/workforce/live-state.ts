import { distanceMeters } from './attendance';

/**
 * What each person is doing right now, for the manager's live map (Duty Day step 4). Pure:
 * the caller hands over today's facts and the route's kept points in time order.
 */
export const LIVE_STATES = [
  'on_visit',
  'moving',
  'idle',
  'gap',
  'location_off',
  'on_leave',
  'off_duty',
] as const;
export type LiveState = (typeof LIVE_STATES)[number];

/** No point for longer than this while on duty is a gap, in minutes. */
export const LIVE_GAP_MINUTES = 20;
/** The last two points must be this close in time to tell a move, in minutes. */
export const LIVE_MOVE_WINDOW_MINUTES = 10;
/** Farther apart than this between the last two points is moving, in metres. */
export const LIVE_MOVE_M = 150;
/** Faster than this at the last point is moving, in metres a second (a brisk walk). */
export const LIVE_MOVE_SPEED_MPS = 1.5;
/** The tail behind a worker: this many minutes, at most this many points. */
export const LIVE_TAIL_MINUTES = 30;
export const LIVE_TAIL_MAX = 30;

export interface LivePoint {
  readonly recordedAt: Date;
  readonly latitude: number;
  readonly longitude: number;
  readonly speedMps: number | null;
}

export interface LiveFacts {
  readonly now: Date;
  /** Approved leave covers today. */
  readonly onLeave: boolean;
  /** Start of the person's open duty day; null when no day is open. */
  readonly dutyStartedAt: Date | null;
  /** A site visit is open (checked in, not out). */
  readonly onVisit: boolean;
  /**
   * Location is switched on for the person and their consent is current. Without it nothing
   * is read from the points: the state comes from duty and visits only.
   */
  readonly locationOn: boolean;
  /** The kept route points of the open day, oldest first. */
  readonly points: readonly LivePoint[];
}

const minutesBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 60_000;

/** Whether the last two points (or the last speed) say the person is on the move. */
function isMoving(points: readonly LivePoint[]): boolean {
  const last = points[points.length - 1];
  if (!last) return false;
  if (last.speedMps !== null && last.speedMps > LIVE_MOVE_SPEED_MPS) return true;
  const before = points[points.length - 2];
  if (!before) return false;
  return (
    minutesBetween(before.recordedAt, last.recordedAt) <= LIVE_MOVE_WINDOW_MINUTES &&
    distanceMeters(before, last) > LIVE_MOVE_M
  );
}

/**
 * Off duty when no day is open, on leave when approved leave covers today and no day is
 * open (someone who started duty on a half day shows on duty); then on a visit; location off
 * without consent or with location switched off; a gap when the last point (or the check-in,
 * with none) is over 20 minutes old; moving; else idle.
 */
export function liveState(facts: LiveFacts): LiveState {
  if (!facts.dutyStartedAt) return facts.onLeave ? 'on_leave' : 'off_duty';
  if (facts.onVisit) return 'on_visit';
  if (!facts.locationOn) return 'location_off';
  const last = facts.points[facts.points.length - 1];
  const heardAt = last?.recordedAt ?? facts.dutyStartedAt;
  if (minutesBetween(heardAt, facts.now) > LIVE_GAP_MINUTES) return 'gap';
  return isMoving(facts.points) ? 'moving' : 'idle';
}

/**
 * The tail behind a worker: points of the last 30 minutes, thinned evenly to at most `max`,
 * always keeping the newest one.
 */
export function liveTail<T extends LivePoint>(
  points: readonly T[],
  now: Date,
  max: number = LIVE_TAIL_MAX,
): T[] {
  const recent = points.filter(
    (point) => minutesBetween(point.recordedAt, now) <= LIVE_TAIL_MINUTES,
  );
  if (recent.length <= max) return recent;
  const step = (recent.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, index) => recent[Math.round(index * step)] as T);
}

/** A customer site on today's map. */
export type LiveSiteStatus = 'planned' | 'in_progress' | 'done' | 'late';

/**
 * In progress while someone is checked in; done once a visit today has ended; late when the
 * planned start (minutes after midnight, business time) has passed and nobody came; else planned.
 */
export function liveSiteStatus(input: {
  readonly open: boolean;
  readonly visitedToday: boolean;
  readonly plannedStartMin: number | null;
  readonly nowMin: number;
}): LiveSiteStatus {
  if (input.open) return 'in_progress';
  if (input.visitedToday) return 'done';
  if (input.plannedStartMin !== null && input.nowMin > input.plannedStartMin) return 'late';
  return 'planned';
}

/**
 * Who may watch a person's day (their route, their place on the live map): the person,
 * HR (`people.manage`) and their direct manager. Nobody else.
 */
export function mayWatchPerson(input: {
  readonly viewerId: string;
  readonly managesPeople: boolean;
  readonly personId: string;
  readonly personManagerId: string | null;
}): boolean {
  if (input.viewerId === input.personId) return true;
  if (input.managesPeople) return true;
  return input.personManagerId !== null && input.personManagerId === input.viewerId;
}
