import { distanceMeters, type GeoPoint } from './attendance';
import type { SiteVisitKind } from './site-visits';

/**
 * Today's sites for a person on duty (Duty Day step 3): the customer sites with a saved pin
 * where they have work today. The phone fences them and the route backstop reads the same
 * list, so both decide the same way.
 */

/** Regions a phone may watch at once is 20 on iOS; two are kept free. */
export const DUTY_SITE_MAX = 18;

/** One site of the day: a task or a service request, with its fence. */
export interface DutySite {
  /** The task, or the service request for `service`. */
  readonly id: string;
  readonly kind: SiteVisitKind;
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusM: number;
}

/** A piece of work that may be at a site today, before it is judged. */
export interface DutySiteCandidate {
  readonly id: string;
  readonly kind: SiteVisitKind;
  readonly label: string;
  /** The customer's site; the same for two jobs at one house, so they share one fence. */
  readonly placeId: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  /** The task's status; a service request is open while it is listed. */
  readonly status: string;
  readonly startDate: string | null;
  readonly dueDate: string | null;
  /** Days of its planned visits that are still waiting (proposed or confirmed). */
  readonly plannedDays: readonly string[];
}

/** A task waiting on others, blocked, finished or in review is not work to do at the site today. */
const NOT_NOW = new Set(['completed', 'in_review', 'waiting', 'blocked']);

/** Whether the work is at its site today: a planned visit, or an open task scheduled today. */
export function worksTodayAtSite(candidate: DutySiteCandidate, today: string): boolean {
  if (candidate.plannedDays.includes(today)) return !NOT_NOW.has(candidate.status);
  if (candidate.kind === 'service') return false;
  if (NOT_NOW.has(candidate.status) || candidate.status === 'pending') return false;
  const from = candidate.startDate ?? candidate.dueDate;
  const to = candidate.dueDate ?? candidate.startDate;
  return from !== null && to !== null && from <= today && today <= to;
}

/**
 * The sites to fence, planned visits first, then by due date. One fence per place (two jobs
 * at one house share it), at most `max`. A site with no saved pin has no fence.
 */
export function selectDutySites(
  candidates: readonly DutySiteCandidate[],
  today: string,
  radiusM: number,
  max: number = DUTY_SITE_MAX,
): DutySite[] {
  const rank = (candidate: DutySiteCandidate) => (candidate.plannedDays.includes(today) ? 0 : 1);
  const ordered = candidates
    .filter(
      (candidate) =>
        candidate.latitude !== null &&
        candidate.longitude !== null &&
        worksTodayAtSite(candidate, today),
    )
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
        a.id.localeCompare(b.id),
    );
  const seen = new Set<string>();
  const sites: DutySite[] = [];
  for (const candidate of ordered) {
    if (seen.has(candidate.placeId)) continue;
    seen.add(candidate.placeId);
    sites.push({
      id: candidate.id,
      kind: candidate.kind,
      label: candidate.label,
      latitude: candidate.latitude as number,
      longitude: candidate.longitude as number,
      radiusM,
    });
    if (sites.length >= max) break;
  }
  return sites;
}

/** The fence for a saved pin, for a visit that is open somewhere. */
export const insideFence = (point: GeoPoint, site: GeoPoint, radiusM: number): boolean =>
  distanceMeters(point, site) <= radiusM;

/**
 * The sites a point cannot be told apart between: it is within the fence of two or more of
 * today's sites whose pins are less than two radii apart, so which job the person is at is
 * not for a phone or the route to guess. Empty when the point is at one site or none. The
 * phone asks the person to check in by hand; the server skips them too.
 */
export function ambiguousSitesAt(point: GeoPoint, sites: readonly DutySite[]): DutySite[] {
  const inside = sites.filter((site) => distanceMeters(point, site) <= site.radiusM);
  return inside.filter((site) =>
    inside.some(
      (other) => other.id !== site.id && distanceMeters(site, other) < site.radiusM + other.radiusM,
    ),
  );
}
