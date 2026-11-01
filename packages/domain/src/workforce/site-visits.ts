import { addDays } from '@oneohm/shared';
import type { EpcStage } from '../epc/stages';
import { distanceMeters, type GeoPoint, minutesOf } from './attendance';

/**
 * Site check-in and check-out, geotagged photos and the day's travel (PRD 4.2, 4.3).
 * Location is read only at check-in, check-out and photo time, with consent, during
 * working hours. Nothing is tracked in between.
 */
export const SITE_VISIT_KINDS = ['survey', 'installation', 'inspection', 'service'] as const;
export type SiteVisitKind = (typeof SITE_VISIT_KINDS)[number];

/** Tasks done at the customer's site, by template. */
const SITE_TASKS: Readonly<Record<string, SiteVisitKind>> = {
  site_survey: 'survey',
  ground_foundation: 'installation',
  structure_installation: 'installation',
  panel_installation: 'installation',
  inverter_installation: 'installation',
  battery_installation: 'installation',
  earthing_protection: 'installation',
  net_meter_installation: 'installation',
  installation_complete: 'inspection',
  testing_commissioning: 'inspection',
  generation_meter_test: 'inspection',
  discom_inspection: 'inspection',
  handover: 'inspection',
};

/**
 * The kind of site visit a task is, or null for office work (documents, loans, orders).
 * Templates an owner adds later count by their stage: installation work is at the site.
 */
export function siteVisitKindOf(task: {
  readonly templateKey: string;
  readonly stage: EpcStage;
}): SiteVisitKind | null {
  const known = SITE_TASKS[task.templateKey];
  if (known) return known;
  if (task.stage === 'installation') return 'installation';
  if (task.stage === 'commissioning') return 'inspection';
  return null;
}

/**
 * The version of the consent words the field app shows. Bump it whenever those words
 * change: everyone is asked again, and nothing is captured until they answer.
 */
export const LOCATION_CONSENT_VERSION = 2;

export interface ConsentState {
  readonly consentedAt: Date | null;
  readonly withdrawnAt: Date | null;
  readonly textVersion: number | null;
}

/** Consent counts only when given, not withdrawn, and for the words shown today. */
export function consentIsCurrent(consent: ConsentState | null | undefined): boolean {
  if (!consent?.consentedAt || consent.withdrawnAt) return false;
  return consent.textVersion === LOCATION_CONSENT_VERSION;
}

/**
 * Location may be read only in working hours ("HH:MM", India time), with a margin either
 * side for an early start or a late visit. Outside it, check-ins are kept without it.
 */
export function inLocationWindow(
  time: string,
  hours: { readonly dayStart: string; readonly dayEnd: string },
  marginMinutes: number,
): boolean {
  const now = minutesOf(time);
  const margin = Math.max(0, marginMinutes);
  return now >= minutesOf(hours.dayStart) - margin && now <= minutesOf(hours.dayEnd) + margin;
}

export interface SiteDistance {
  readonly distanceM: number;
  /** Farther than the allowed radius, after allowing for the phone's accuracy. */
  readonly far: boolean;
}

/**
 * How far a reading is from the site's saved location. A far reading is flagged for
 * the manager, never refused: the saved pin may be off, or the person parked nearby.
 * Null when the site has no saved location.
 */
export function siteDistance(
  point: GeoPoint & { readonly accuracyM?: number | null | undefined },
  site: GeoPoint | null,
  radiusM: number,
): SiteDistance | null {
  if (!site) return null;
  const distanceM = distanceMeters(point, site);
  const slack = Math.min(Math.max(0, point.accuracyM ?? 0), 100);
  return { distanceM, far: distanceM - slack > radiusM };
}

/**
 * Raw coordinates from days before this date are cleared; distances and flags stay.
 * With 90 days kept, on 1 Nov the cut-off is 3 Aug: 3 Aug itself is still kept.
 */
export function locationCutoff(today: string, retentionDays: number): string {
  return addDays(today, -Math.max(1, Math.floor(retentionDays)));
}

/** A reading from this day is past the retention period and loses its coordinates. */
export function locationExpired(day: string, today: string, retentionDays: number): boolean {
  return day < locationCutoff(today, retentionDays);
}
