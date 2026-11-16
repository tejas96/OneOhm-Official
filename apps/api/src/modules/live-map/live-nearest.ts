import type { LiveSite, NearestPeople } from '@oneohm/api-contracts';
import { distanceMeters, LIVE_GAP_MINUTES } from '@oneohm/domain';
import type { VisitWithSite } from '../site-activity/site-visit-read';
import type { WatchedPerson } from '../workforce/duty-scope';
import { initialsOf } from './live-person';
import type { DayRow, PointRow } from './live-read';

/** "Send nearest" lists at most this many people. */
export const NEAREST_MAX = 5;
/** The ETA is the straight line at this speed: a rough town drive, in km/h. */
export const NEAREST_KMH = 25;

/** Straight-line minutes at 25 km/h, at least 1. */
export const etaMinutes = (distanceM: number): number =>
  Math.max(1, Math.round(distanceM / ((NEAREST_KMH * 1000) / 60)));

export interface NearestFacts {
  readonly site: Pick<LiveSite, 'id' | 'latitude' | 'longitude'>;
  readonly people: readonly WatchedPerson[];
  readonly now: Date;
  /** Today's duty days by person. */
  readonly days: ReadonlyMap<string, DayRow>;
  readonly onLeave: ReadonlySet<string>;
  /** Each open day's newest usable point, by day id. */
  readonly latest: ReadonlyMap<string, PointRow>;
  readonly visits: readonly VisitWithSite[];
}

/**
 * The free people nearest the site (Duty Day step 5): on duty today (an open day), not on a
 * site visit, not on leave, location on, and last seen under 20 minutes ago; nearest first by
 * straight line, at most 5, each with an "about" ETA.
 */
export function nearestPeople(facts: NearestFacts): NearestPeople {
  const visiting = new Set(
    facts.visits.filter((visit) => !visit.row.checkOutAt).map((visit) => visit.row.userId),
  );
  const fresh = facts.now.getTime() - LIVE_GAP_MINUTES * 60_000;
  const people = facts.people.flatMap((person) => {
    const day = facts.days.get(person.id);
    if (!day || day.checkOutAt || !person.locationOn) return [];
    if (visiting.has(person.id) || facts.onLeave.has(person.id)) return [];
    const last = facts.latest.get(day.id);
    if (!last || last.recordedAt.getTime() < fresh) return [];
    const distanceM = distanceMeters(last, facts.site);
    const eta = etaMinutes(distanceM);
    return [
      {
        person: {
          id: person.id,
          fullName: person.fullName,
          initials: initialsOf(person.fullName),
          avatarSwatch: person.avatarSwatch,
          roleLabel: person.designation ?? person.roleName,
          phone: person.phone,
        },
        distanceM,
        etaMinutes: eta,
        etaLabel: `about ${eta} min`,
        position: {
          latitude: last.latitude,
          longitude: last.longitude,
          at: last.recordedAt.toISOString(),
        },
      },
    ];
  });
  people.sort((a, b) => a.distanceM - b.distanceM);
  return { siteId: facts.site.id, people: people.slice(0, NEAREST_MAX) };
}
