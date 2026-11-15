import { jobErrorText } from '@oneohm/domain';
import { jobFailedNotice } from './attendance-notices';
import type { DatabaseExecutor } from './client';
import { dutyAlertTargets } from './duty-alerts';
import { notify } from './notify';

/**
 * A job that still failed after its retries tells the admin desk (live review A11): the
 * people who can open Settings, the Super Admin included (it is their desk). Once a day
 * per job and person, so a job failing every night is one alert a night, not a flood.
 * Returns how many people were told.
 */
export async function alertJobFailed(
  db: DatabaseExecutor,
  job: string,
  error: unknown,
  today: string,
): Promise<number> {
  const notice = jobFailedNotice(job, jobErrorText(error), today);
  const people = await dutyAlertTargets(db, 'settings.manage', { includeDesk: true });
  for (const userId of people)
    await notify(db, { userId }, { ...notice, dedupeKey: `${notice.dedupeKey}:${userId}` });
  return people.length;
}
