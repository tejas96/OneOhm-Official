import type { DutyPointsResult, TravelDay } from '@oneohm/api-contracts';
import { runTravelMorningJob } from '@oneohm/database';
import { LOCATION_CONSENT_VERSION } from '@oneohm/domain';
import { expect } from 'vitest';
import { acceptanceDb, rows } from './db';
import { MIRAJ, type Plan, routePoints, SANGLI } from './duty-route';
import { Session } from './http';
import { type OwnPerson, ownPerson } from './people';
import type { Sale } from './sales';
import { taskByKey } from './tasks';
import { indiaDate, inLocationHours } from './travel';

export interface DbClaim {
  id: string;
  status: string;
  withdrawn_by_resume_at: string | null;
  auto_made: boolean;
  auto_approved: boolean;
  review_reasons: string[] | null;
  decided_by_user_id: string | null;
  decision_note: string | null;
  payable_id: string | null;
  project_id: string | null;
  amount_paise: number;
  distance_m: number;
}

/**
 * What the Duty Day scenarios share: a worker's day with a recorded route, the Settings
 * switches, and the morning job. `admin` and `sale` are read when used, after `beforeAll`.
 */
export function dutyDayKit(admin: () => Session, sale: () => Sale) {
  const people: OwnPerson[] = [];
  let saved: { policy: Record<string, unknown> } | null = null;
  const travelPolicy = () => saved?.policy.travel as Record<string, unknown>;
  const putTravel = (patch: Record<string, unknown>) =>
    admin().put('/settings/workforce', {
      ...saved?.policy,
      // The demo day ends at Miraj, 7.5 km from the home base at Sangli: allow it unless a scenario narrows it.
      travel: { ...travelPolicy(), baseStartMaxKm: 10, ...patch },
    });
  /** Saves Settings → Workforce and switches automatic approval on, which is off by default. */
  const startPolicy = async () => {
    saved = await admin().get<{ policy: Record<string, unknown> }>('/settings/workforce');
    expect(travelPolicy()).toMatchObject({ autoClaim: true, autoApprove: false });
    await putTravel({ autoApprove: true });
  };
  const restorePolicy = async () => {
    if (saved) await admin().put('/settings/workforce', saved.policy);
  };
  /** The morning job as it runs the day after: earlier days' claims are due. */
  const tomorrow = () => {
    const next = new Date(`${indiaDate()}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().slice(0, 10);
  };
  const morning = (today = tomorrow()) => runTravelMorningJob(acceptanceDb().db, today);
  const claimOf = (person: OwnPerson) =>
    rows<{ id: string }>('SELECT id FROM travel_claims WHERE user_id = $1', [person.id]);
  const dbClaim = async (person: OwnPerson) =>
    (
      await rows<DbClaim>(
        'SELECT * FROM travel_claims WHERE user_id = $1 AND withdrawn_by_resume_at IS NULL',
        [person.id],
      )
    )[0];

  /** Consent, a day that began 165 minutes ago, two site visits, the route points, End duty. */
  async function workDay(
    name: string,
    plan: Plan,
    flush = true,
    withVisits = true,
    /** The person's saved base: home at the route's start by default; null saves none. */
    base: { latitude: number; longitude: number } | null = SANGLI,
  ) {
    const person = await ownPerson(admin(), name);
    people.push(person);
    if (base)
      await admin().patch(`/people/${person.id}`, {
        base: { latitude: base.latitude, longitude: base.longitude, label: 'Home' },
      });
    const visits = withVisits
      ? [
          { task: taskByKey(sale().project, 'site_survey'), at: SANGLI },
          { task: taskByKey(sale().project, 'installation_complete'), at: MIRAJ },
        ]
      : [];
    for (const visit of visits)
      await admin().post(`/tasks/${visit.task.id}/assign`, { userId: person.id });
    const me = await Session.code(person.phone);
    await me.post('/attendance/consent', { given: true, version: LOCATION_CONSENT_VERSION });
    await me.post('/attendance/check-in', {});
    // Points recorded before the consent or the check-in are turned away, so both move back.
    await rows(
      "UPDATE location_consents SET consented_at = consented_at - interval '5 hours' WHERE user_id = $1",
      [person.id],
    );
    // The route starts 160 minutes ago, so the check-in sits 5 minutes before its first point.
    await rows(
      "UPDATE attendance_days SET check_in_at = now() - interval '165 minutes' WHERE user_id = $1",
      [person.id],
    );
    await inLocationHours(admin(), async () => {
      for (const visit of visits) {
        await me.post(`/tasks/${visit.task.id}/site/check-in`, { position: visit.at });
        await me.post(`/tasks/${visit.task.id}/site/check-out`, { position: visit.at });
      }
    });
    if (flush) {
      const sent = await me.raw<DutyPointsResult>('POST', '/me/duty-points', {
        points: routePoints(plan),
      });
      expect(sent.body.accepted).toBeGreaterThan(0);
      expect(sent.body.rejected).toEqual([]);
    }
    await me.post('/attendance/check-out', {});
    const day = await me.get<TravelDay>(`/me/travel?date=${indiaDate()}`);
    return { person, me, day };
  }

  return {
    people,
    putTravel,
    startPolicy,
    restorePolicy,
    morning,
    claimOf,
    dbClaim,
    workDay,
  };
}
