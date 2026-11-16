import { distanceMeters, type GeoPoint } from './attendance';
import { keptPoints, type RoutePoint } from './route-km';

/**
 * Whether a site visit is proved by where the phone was (Duty Day step 5, spec section 4).
 * Pure: worked out when the visit closes, and again when late points arrive.
 */
export const VISIT_PROOFS = ['verified', 'doubtful', 'no_proof'] as const;
export type VisitProofValue = (typeof VISIT_PROOFS)[number];

/**
 * Why a visit is not verified. Doubtful: `short_visit`, `not_seen_at_site`, `far_check_in`,
 * `photo_far`, `fake_gps`, `customer_said_no` (the customer tapped No on "Was this visit
 * done?"). No proof: `no_location` (nothing says where the person was) or `site_unknown`
 * (located, but the site has no saved pin to compare with).
 */
export const VISIT_PROOF_REASONS = [
  'short_visit',
  'not_seen_at_site',
  'far_check_in',
  'photo_far',
  'fake_gps',
  'customer_said_no',
  'no_location',
  'site_unknown',
] as const;
export type VisitProofReason = (typeof VISIT_PROOF_REASONS)[number];

/** The customer's answer to "Was this visit done?" (Duty Day step 6). */
export const CUSTOMER_SAID = ['yes', 'no'] as const;
export type CustomerSaid = (typeof CUSTOMER_SAID)[number];

/** A visit shorter than this is too short to prove, in minutes. */
export const PROOF_MIN_VISIT_MINUTES = 10;
/** Points near the site must cover at least this share of the visit. */
export const PROOF_MIN_COVERAGE = 0.6;
/** A point this far beyond the site's fence still counts as at the site, in metres. */
export const PROOF_NEAR_MARGIN_M = 50;
/** Each point stands for this long around it: the phone's 2-minute cadence. */
export const PROOF_POINT_SPAN_MS = 2 * 60_000;

export interface VisitProofInput {
  readonly checkInAt: Date;
  readonly checkOutAt: Date;
  /** The site's saved pin; null when it has none. */
  readonly site: GeoPoint | null;
  /** The site's fence, in metres (Settings → automatic visits). */
  readonly radiusM: number;
  /** The person's route points of the day, any order, mocked and vague ones included. */
  readonly points: readonly RoutePoint[];
  /** The check-in kept a location of its own. */
  readonly checkInLocated: boolean;
  /** The check-in was flagged far from the site; null when unknown. */
  readonly checkInFar: boolean | null;
  /** The visit's photos: far from the site, near it, or not located (null). */
  readonly photos: readonly { readonly far: boolean | null }[];
  /**
   * The phone was expected to send its route during the visit: location switched on for the
   * person and consent given. When false, missing route points prove nothing either way, so
   * the visit is judged by the check-in distance, its length, mocked flags and photos.
   * Defaults to true.
   */
  readonly trackingExpected?: boolean;
  /** The customer's tap on "Was this visit done?"; null or left out when they have not answered. */
  readonly customerSaid?: CustomerSaid | null;
}

export interface VisitProof {
  readonly proof: VisitProofValue;
  readonly reasons: readonly VisitProofReason[];
}

/** The share of the visit with a kept point near the site, each point covering a minute either side. */
export function siteCoverage(
  kept: readonly RoutePoint[],
  input: Pick<VisitProofInput, 'checkInAt' | 'checkOutAt' | 'site' | 'radiusM'>,
): number {
  const { site } = input;
  const from = input.checkInAt.getTime();
  const to = input.checkOutAt.getTime();
  if (!site || to <= from) return 0;
  const half = PROOF_POINT_SPAN_MS / 2;
  const spans = kept
    .filter((point) => distanceMeters(point, site) <= input.radiusM + PROOF_NEAR_MARGIN_M)
    .map((point) => [
      Math.max(from, point.recordedAt.getTime() - half),
      Math.min(to, point.recordedAt.getTime() + half),
    ])
    .filter(([start = 0, end = 0]) => end > start)
    .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
  let covered = 0;
  let reach = from;
  for (const [start = 0, end = 0] of spans) {
    const begin = Math.max(start, reach);
    if (end > begin) covered += end - begin;
    reach = Math.max(reach, end);
  }
  return covered / (to - from);
}

/**
 * The visit's proof with the customer's answer on top (spec section 4): Yes is the strongest
 * proof, so the visit is verified unless a point was mocked (fake GPS stays doubtful); No
 * makes it doubtful with `customer_said_no` added to any other reasons.
 */
export function visitProof(input: VisitProofInput): VisitProof {
  const route = routeProof(input);
  if (input.customerSaid === 'no')
    return {
      proof: 'doubtful',
      reasons: [...(route.proof === 'doubtful' ? route.reasons : []), 'customer_said_no' as const],
    };
  if (input.customerSaid === 'yes' && !route.reasons.includes('fake_gps'))
    return { proof: 'verified', reasons: [] };
  return route;
}

/**
 * Verified when the visit lasted 10 minutes or more, points near the site cover 60% of it,
 * no point during it was mocked, the check-in was not far, and (when photos have a place) a
 * photo was taken near the site. Any failing check makes it doubtful, with every reason. With
 * no location at all (no point and no check-in reading, nothing mocked) there is no proof; with
 * a location but no saved site pin, nothing can be compared, so no proof either. When the route
 * was not expected (`trackingExpected` false) the coverage check is left out: a check-in that
 * was not far is then what places the person at the site.
 */
export function routeProof(input: VisitProofInput): VisitProof {
  const from = input.checkInAt.getTime();
  const to = input.checkOutAt.getTime();
  const during = input.points
    .filter((point) => point.recordedAt.getTime() >= from && point.recordedAt.getTime() <= to)
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const kept = keptPoints(during);
  const mocked = during.some((point) => point.mocked);
  if (!mocked && kept.length === 0 && !input.checkInLocated)
    return { proof: 'no_proof', reasons: ['no_location'] };
  const reasons: VisitProofReason[] = [];
  if ((to - from) / 60_000 < PROOF_MIN_VISIT_MINUTES) reasons.push('short_visit');
  const routeExpected = input.trackingExpected ?? true;
  if (routeExpected && input.site && siteCoverage(kept, input) < PROOF_MIN_COVERAGE)
    reasons.push('not_seen_at_site');
  if (input.checkInFar === true) reasons.push('far_check_in');
  const placed = input.photos.filter((photo) => photo.far !== null);
  if (placed.length > 0 && placed.every((photo) => photo.far === true)) reasons.push('photo_far');
  if (mocked) reasons.push('fake_gps');
  if (reasons.length > 0) return { proof: 'doubtful', reasons };
  if (!input.site) return { proof: 'no_proof', reasons: ['site_unknown'] };
  // Without a route, only a check-in placed near the site proves the visit.
  if (!routeExpected && (!input.checkInLocated || input.checkInFar !== false))
    return { proof: 'no_proof', reasons: ['no_location'] };
  return { proof: 'verified', reasons: [] };
}
