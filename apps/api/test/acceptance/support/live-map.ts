// The live map scenarios (Duty Day step 4): a person on duty with route points, and the reads.
import type { LivePerson, LiveTeam } from '@oneohm/api-contracts';
import { LOCATION_CONSENT_VERSION } from '@oneohm/domain';
import { expect } from 'vitest';
import { rows } from './db';
import { Session } from './http';
import type { OwnPerson } from './people';
import { inLocationHours } from './travel';

export const SANGLI = { latitude: 16.8524, longitude: 74.5815 };
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
let counter = 0;
const id = () =>
  `00000000-0000-4000-8000-${String(Date.now() % 1e9).padStart(9, '0')}${String(++counter).padStart(3, '0')}`;

/** A reading `metresNorth` of Sangli, `minutes` ago. */
export const point = (minutes: number, metresNorth: number, speedMps: number, mocked = false) => ({
  id: id(),
  recordedAt: minutesAgo(minutes),
  latitude: SANGLI.latitude + metresNorth / 111_195,
  longitude: SANGLI.longitude,
  accuracyM: 10,
  speedMps,
  headingDeg: null,
  altitudeM: null,
  mocked,
  batteryPercent: 61,
  charging: false,
  network: 'cellular',
});

/** Consent, a duty day that began an hour ago, then the points. */
export async function onDuty(
  admin: Session,
  person: OwnPerson,
  points: ReturnType<typeof point>[],
): Promise<Session> {
  const me = await Session.code(person.phone);
  await me.post('/attendance/consent', { given: true, version: LOCATION_CONSENT_VERSION });
  await me.post('/attendance/check-in', {});
  await rows(
    "UPDATE location_consents SET consented_at = consented_at - interval '3 hours' WHERE user_id = $1",
    [person.id],
  );
  await rows(
    "UPDATE attendance_days SET check_in_at = check_in_at - interval '1 hour' WHERE user_id = $1",
    [person.id],
  );
  if (points.length) {
    const reply = await inLocationHours(admin, () => me.post('/me/duty-points', { points }));
    expect(reply).toMatchObject({ accepted: points.length });
  }
  return me;
}

export const liveTeam = (who: Session) => who.raw<LiveTeam>('GET', '/live/team');

export async function entryOf(who: Session, person: OwnPerson): Promise<LivePerson | undefined> {
  const team = await liveTeam(who);
  expect(team.status).toBe(200);
  return team.body.people.find((row) => row.person.id === person.id);
}
