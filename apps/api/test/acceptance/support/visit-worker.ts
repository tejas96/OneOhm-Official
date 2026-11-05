import { queueActionChecks } from '../../../../worker/src/activities/action-checks';
import { openMaintenanceVisits } from '../../../../worker/src/activities/after-sales';
import { offerAmcRenewals } from '../../../../worker/src/activities/amc-renewals';
import { queueCallTasks } from '../../../../worker/src/activities/call-tasks';
import { queueCareReminders } from '../../../../worker/src/activities/care-reminders';
import { queueVisitReminders } from '../../../../worker/src/activities/visit-reminders';
import { acceptanceDb, rows } from './db';

// The worker's visit steps run once by hand at a chosen clock (the timer is off here).

const TZ = 'Asia/Kolkata';

/** 12:00 in India on a day: a working hour (the day must not be a Sunday). */
export const noonOn = (day: string) => new Date(`${day}T06:30:00Z`);
/** 10:00 in India: the visit morning. */
export const morningOn = (day: string) => new Date(`${day}T04:30:00Z`);
/** 19:30 in India: past the end of the working day. */
export const eveningOn = (day: string) => new Date(`${day}T14:00:00Z`);

export const runVisitWorker = (now: Date) => queueVisitReminders(acceptanceDb().db, now, TZ);
export const offerRenewals = (today: string) => offerAmcRenewals(acceptanceDb().db, today);
export const runCare = (now: Date) => queueCareReminders(acceptanceDb().db, now, TZ);
export const runChecks = (now: Date) => queueActionChecks(acceptanceDb().db, now, TZ);
export const runCallTasks = (now: Date) => queueCallTasks(acceptanceDb().db, now);
export const openMaintenance = (today: string) => openMaintenanceVisits(acceptanceDb().db, today);

/** Switches a customer template on for a scenario (the rows start off until Meta approves them). */
export async function templateOn(key: string, on = true): Promise<() => Promise<void>> {
  const [before] = await rows<{ active: boolean }>(
    'SELECT active FROM message_templates WHERE key = $1',
    [key],
  );
  await rows('UPDATE message_templates SET active = $2 WHERE key = $1', [key, on]);
  return async () => {
    await rows('UPDATE message_templates SET active = $2 WHERE key = $1', [
      key,
      before?.active ?? false,
    ]);
  };
}
