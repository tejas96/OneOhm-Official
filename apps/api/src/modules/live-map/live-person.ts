import type { LivePerson } from '@oneohm/api-contracts';
import { keptPoints, liveState, liveTail } from '@oneohm/domain';
import type { VisitWithSite } from '../site-activity/site-visit-read';
import type { WatchedPerson } from '../workforce/duty-scope';
import type { DayKm } from './live-km';
import type { DayRow, PointRow } from './live-read';

/** Initials from the words that start with a letter or digit ("Ravi Patil" → "RP"). */
export function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => /^[\p{L}\p{N}]/u.test(part));
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

export interface PersonFacts {
  readonly person: WatchedPerson;
  readonly now: Date;
  /** Today's duty day, open or closed; null when none. */
  readonly day: DayRow | null;
  /** The open day's points of the last 30 minutes, oldest first. */
  readonly recent: readonly PointRow[];
  /** The open day's newest usable point, however old (where a quiet person was last seen). */
  readonly latest: PointRow | null;
  /** Km and the mocked flag of today's day; absent when not measured. */
  readonly km: DayKm | null;
  readonly onLeave: boolean;
  /** Today's site visits only. */
  readonly visits: readonly VisitWithSite[];
  /** Today's site ids for this person (the live map's sites layer). */
  readonly siteIds: ReadonlySet<string>;
}

const workOf = (visit: VisitWithSite) => visit.row.taskId ?? visit.row.serviceRequestId;

/** The kept points to judge by: the last 30 minutes, else the newest usable point alone. */
function judgedPoints(facts: PersonFacts): PointRow[] {
  const kept = keptPoints(facts.recent);
  if (kept.length > 0) return kept;
  return facts.latest ? [facts.latest] : [];
}

/** The last kept point, with battery and network from the newest reading. */
function positionOf(
  last: PointRow | undefined,
  newest: PointRow | undefined,
): LivePerson['position'] {
  if (!last) return null;
  return {
    latitude: last.latitude,
    longitude: last.longitude,
    accuracyM: last.accuracyM,
    at: last.recordedAt.toISOString(),
    batteryPercent: newest?.batteryPercent ?? null,
    charging: newest?.charging ?? null,
    network: newest?.network ?? null,
  };
}

/**
 * One person on the live map. Only today's open day is live. With location off (no current
 * consent, or switched off) nothing is read from the route: no position, tail, km, battery or
 * mocked flag; the state comes from duty and visits only. The alert counts are added by the caller.
 */
export function livePerson(facts: PersonFacts): Omit<LivePerson, 'alerts'> {
  const { person, day, now } = facts;
  const openDay = day && !day.checkOutAt ? day : null;
  const reads = person.locationOn;
  const kept = reads && openDay ? judgedPoints(facts) : [];
  const open = facts.visits.find((visit) => !visit.row.checkOutAt) ?? null;
  const state = liveState({
    now,
    onLeave: facts.onLeave,
    dutyStartedAt: openDay?.checkInAt ?? null,
    onVisit: open !== null,
    locationOn: reads,
    points: kept,
  });
  const last = kept[kept.length - 1];
  const visited = new Set(facts.visits.flatMap((visit) => workOf(visit) ?? []));
  return {
    person: {
      id: person.id,
      fullName: person.fullName,
      initials: initialsOf(person.fullName),
      photoUrl: null,
      avatarSwatch: person.avatarSwatch,
      roleLabel: person.designation ?? person.roleName,
      phone: person.phone,
    },
    state,
    position: positionOf(last, facts.recent[facts.recent.length - 1] ?? last),
    tail: liveTail(kept, now).map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      at: point.recordedAt.toISOString(),
    })),
    today: {
      kmSoFar: reads && day ? (facts.km?.km ?? 0) : null,
      visitsDone: facts.visits.filter((visit) => visit.row.checkOutAt).length,
      visitsPlanned: new Set([...facts.siteIds, ...visited]).size,
      currentVisit: open
        ? {
            label: open.record.taskTitle ?? open.record.siteLabel ?? open.row.kind,
            since: open.row.checkInAt.toISOString(),
          }
        : null,
      dutyStartedAt: openDay?.checkInAt.toISOString() ?? null,
    },
    flags: { mockedToday: reads ? (facts.km?.mockedToday ?? false) : null },
  };
}
