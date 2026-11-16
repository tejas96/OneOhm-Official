import type { DutyAlert, LivePerson, LiveSite } from '@oneohm/api-contracts';
import type { LatLng } from '../map-camera';

/**
 * The feed's order: what needs acting on now (red) above what needs a look (amber), and
 * within each the newest first. Ties keep a steady order by id.
 */
export function sortAlerts(alerts: readonly DutyAlert[]): DutyAlert[] {
  const rank = (alert: DutyAlert) => (alert.severity === 'red' ? 0 : 1);
  return [...alerts].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
      a.id.localeCompare(b.id),
  );
}

/** Red and all open alerts, for the tab and the top badge. */
export function alertCounts(alerts: readonly DutyAlert[]) {
  return { open: alerts.length, red: alerts.filter((alert) => alert.severity === 'red').length };
}

/** The live map's site an alert is about (a missed visit's task or request), if any. */
export function alertSiteId(alert: DutyAlert): string | null {
  if (alert.subject.type === 'task' || alert.subject.type === 'service_request')
    return alert.subject.id;
  const site = alert.detail.siteId;
  return typeof site === 'string' ? site : null;
}

/** Whether the alert offers "Send nearest": a planned visit nobody reached. */
export const canSendNearest = (alert: DutyAlert) =>
  alert.kind === 'visit_missed' && alertSiteId(alert) !== null;

/** Where the map goes for an alert: its site when it has one on the map, else the person. */
export function alertTarget(
  alert: DutyAlert,
  people: readonly LivePerson[],
  sites: readonly LiveSite[],
): { kind: 'person' | 'site'; id: string; at: LatLng | null } {
  const siteId = alertSiteId(alert);
  const site = siteId ? sites.find((row) => row.id === siteId) : undefined;
  if (site) return { kind: 'site', id: site.id, at: { lat: site.latitude, lng: site.longitude } };
  const person = people.find((row) => row.person.id === alert.person.id);
  const position = person?.position;
  return {
    kind: 'person',
    id: alert.person.id,
    at: position ? { lat: position.latitude, lng: position.longitude } : null,
  };
}

/** "just now", "12 min ago", "3 h ago", "2 days ago": the parts for the copy. */
export function agoParts(iso: string, now: number): { unit: 'now' | 'min' | 'h' | 'd'; n: number } {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return { unit: 'now', n: 0 };
  if (minutes < 60) return { unit: 'min', n: minutes };
  if (minutes < 24 * 60) return { unit: 'h', n: Math.floor(minutes / 60) };
  return { unit: 'd', n: Math.floor(minutes / (24 * 60)) };
}

/** The newest open alert of a kind (a push notice opens the feed on it). */
export function newestOfKind(alerts: readonly DutyAlert[], kind: string): DutyAlert | null {
  return (
    [...alerts]
      .filter((alert) => alert.kind === kind)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null
  );
}

/** The alerts that are about a person's day (they open the day view from a notice). */
export const DAY_KINDS: ReadonlySet<string> = new Set([
  'not_checked_in',
  'fake_gps',
  'route_gap',
  'unknown_stop',
  'visit_open_long',
  'job_left_unfinished',
]);
