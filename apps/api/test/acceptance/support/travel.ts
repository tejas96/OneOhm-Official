import type { ProjectDetail, TravelClaim, TravelDay } from '@oneohm/api-contracts';
import { LOCATION_CONSENT_VERSION } from '@oneohm/domain';
import { Session } from './http';
import { type OwnPerson, ownPerson } from './people';
import { taskByKey } from './tasks';

/**
 * A staff member's travel for a project (PRD 4.3): consent to location, site check-in
 * and check-out at two of the project's site tasks some kilometres apart, then a travel
 * claim tagged to the project. Location is read only in working hours, so when the suite
 * runs at night the acceptance database's working day is widened while it runs.
 */
const indiaTime = () =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
export const indiaDate = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const minutes = (time: string) => {
  const [hours = 0, mins = 0] = time.split(':').map(Number);
  return hours * 60 + mins;
};

interface Policy {
  attendance: { dayStart: string; dayEnd: string };
  travel: { hoursMarginMinutes: number };
}

/** Runs `work` inside working hours for location, restoring the saved policy after. */
export async function inLocationHours<T>(admin: Session, work: () => Promise<T>): Promise<T> {
  const { policy } = await admin.get<{ policy: Policy }>('/settings/workforce');
  const now = minutes(indiaTime());
  const margin = policy.travel.hoursMarginMinutes;
  const open =
    now >= minutes(policy.attendance.dayStart) - margin &&
    now <= minutes(policy.attendance.dayEnd) + margin;
  if (open) return work();
  await admin.put('/settings/workforce', {
    ...policy,
    attendance: { ...policy.attendance, dayStart: '00:00', dayEnd: '23:59' },
  });
  try {
    return await work();
  } finally {
    await admin.put('/settings/workforce', policy);
  }
}

const SANGLI = { latitude: 16.8524, longitude: 74.5815, accuracyM: 12 };
const MIRAJ = { latitude: 16.8222, longitude: 74.6457, accuracyM: 15 };

export interface ProjectTravel {
  person: OwnPerson;
  day: TravelDay;
  claim: TravelClaim;
}

/** Two site visits on the project and an approved travel claim for it. */
export async function claimProjectTravel(
  admin: Session,
  detail: ProjectDetail,
  name: string,
): Promise<ProjectTravel> {
  const person = await ownPerson(admin, name);
  const visits = [
    { task: taskByKey(detail, 'site_survey'), at: SANGLI },
    { task: taskByKey(detail, 'installation_complete'), at: MIRAJ },
  ];
  for (const visit of visits) {
    await admin.post(`/tasks/${visit.task.id}/assign`, { userId: person.id });
  }
  const me = await Session.code(person.phone);
  await me.post('/attendance/consent', { given: true, version: LOCATION_CONSENT_VERSION });
  return inLocationHours(admin, async () => {
    for (const visit of visits) {
      await me.post(`/tasks/${visit.task.id}/site/check-in`, { position: visit.at });
      await me.post(`/tasks/${visit.task.id}/site/check-out`, { position: visit.at });
    }
    const day = await me.get<TravelDay>(`/me/travel?date=${indiaDate()}`);
    const made = await me.post<TravelClaim>('/me/travel-claims', {
      workDate: indiaDate(),
      projectId: detail.id,
      note: 'Survey and installation check visits (test)',
    });
    const claim = await admin.post<TravelClaim>(`/travel-claims/${made.id}/decide`, {
      approve: true,
      note: 'Checked against the visits (test)',
    });
    return { person, day, claim };
  });
}
