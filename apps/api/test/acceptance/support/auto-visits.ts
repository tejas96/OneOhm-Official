import { LOCATION_CONSENT_VERSION } from '@oneohm/domain';
import { rows } from './db';
import type { Session } from './http';
import type { OwnPerson } from './people';

// What the Duty Day "automatic site visit" scenarios (87-*) share: a customer's pin, a worker
// on duty, route points at a time before now, and the person's visit rows.
export const SITE = { latitude: 16.8524, longitude: 74.5815 };
/** About 2 km north: well past the 150 m fence plus its 100 m margin. */
export const AWAY = { latitude: 16.8704, longitude: 74.5815 };
export const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

let counter = 0;
export const pointAt = (minutes: number, where: { latitude: number; longitude: number }) => ({
  id: `00000000-0000-4000-8000-${String(Date.now() % 1e9).padStart(9, '0')}${String(++counter).padStart(3, '0')}`,
  recordedAt: minutesAgo(minutes).toISOString(),
  ...where,
  accuracyM: 12,
  speedMps: 1,
  headingDeg: 90,
  altitudeM: null,
  mocked: false,
  batteryPercent: 70,
  charging: false,
  network: 'cellular',
});

export const sendPoints = (who: Session, points: ReturnType<typeof pointAt>[]) =>
  who.raw<{ accepted: number }>('POST', '/me/duty-points', { points });

export interface VisitRow {
  id: string;
  check_in_at: Date;
  check_out_at: Date | null;
  check_in_source: string;
  check_out_source: string | null;
  leave_reason: string | null;
  visit_id: string | null;
  delayed: boolean;
}
export const visitRows = (userId: string) =>
  rows<VisitRow>('SELECT * FROM site_visits WHERE user_id = $1 ORDER BY check_in_at', [userId]);

/** Consent, and an open day that began 165 minutes ago (so points of the last 2 hours fit). */
export async function onDuty(who: Session, person: OwnPerson) {
  await who.post('/attendance/consent', { given: true, version: LOCATION_CONSENT_VERSION });
  await who.post('/attendance/check-in', {});
  await rows(
    "UPDATE location_consents SET consented_at = consented_at - interval '5 hours' WHERE user_id = $1",
    [person.id],
  );
  await rows(
    "UPDATE attendance_days SET check_in_at = now() - interval '165 minutes' WHERE user_id = $1",
    [person.id],
  );
}

/** The project's customer site gets a saved pin, and the task is scheduled today. */
export async function pinAndSchedule(
  projectId: string,
  taskId: string,
  pin: { latitude: number; longitude: number },
  day: string,
) {
  await rows(
    `UPDATE properties SET latitude = $2, longitude = $3, location_source = 'gps'
      WHERE id = (SELECT property_id FROM projects WHERE id = $1)`,
    [projectId, pin.latitude, pin.longitude],
  );
  await rows('UPDATE project_tasks SET start_date = $2, due_date = $2 WHERE id = $1', [
    taskId,
    day,
  ]);
}

/** A phone fence event sent as the app does: the reading, its source, when it happened. */
export const fenceBody = (
  where: { latitude: number; longitude: number },
  patch: Record<string, unknown> = {},
) => ({
  position: { ...where, accuracyM: 15 },
  source: 'auto_fence',
  tappedAt: new Date().toISOString(),
  mocked: false,
  ...patch,
});
