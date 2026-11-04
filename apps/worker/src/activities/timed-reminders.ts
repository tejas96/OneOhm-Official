import {
  type Database,
  jobSucceededSince,
  readBusinessSetting,
  recordJobRun,
} from '@oneohm/database';
import { type ReminderTiming, timeReached } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { queueChatReminders } from './chat-reminders';
import { queueTimedFollowUps } from './follow-up-reminders';
import type { WorkerJob } from './job-runners';
import { queuePaperReminders } from './paper-reminders';

/** Jobs that go out at a time set in Settings → Reminders, once a day (PRD 7.2). */
const TIMED: readonly (readonly [WorkerJob, keyof ReminderTiming])[] = [
  ['staff_digests', 'staffDigestTime'],
  ['follow_up_reminders', 'staffDigestTime'],
  ['owner_summaries', 'ownerSummaryTime'],
];

/** The business clock now ("HH:MM") and when today began there. */
export function businessClock(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
  const elapsed = ((part('hour') * 60 + part('minute')) * 60 + part('second')) * 1000;
  const clock = `${String(part('hour')).padStart(2, '0')}:${String(part('minute')).padStart(2, '0')}`;
  return { clock, midnight: new Date(now.getTime() - elapsed - now.getMilliseconds()) };
}

/**
 * Runs every few minutes: each timed job goes out the first time its set time has come
 * and it has not yet finished today. A failed one is tried again on the next tick.
 * Follow-ups set for a time today are checked on every tick.
 */
export async function runTimedReminders(
  db: Database,
  timeZone: string,
  jobs: Readonly<Record<WorkerJob, () => Promise<number>>>,
): Promise<number> {
  const timing = await readBusinessSetting(db, 'reminders');
  const { clock, midnight } = businessClock(timeZone);
  let ran = 0;
  let failure: unknown = null;
  for (const [name, field] of TIMED) {
    if (!timeReached(String(timing[field]), clock)) continue;
    if (await jobSucceededSince(db, name, midnight)) continue;
    try {
      await recordJobRun(db, name, jobs[name], String);
      ran += 1;
    } catch (error) {
      failure ??= error;
    }
  }
  try {
    ran += await queueTimedFollowUps(db, todayIn(timeZone), clock);
  } catch (error) {
    failure ??= error;
  }
  // WhatsApp customers waiting for a person's answer (each alert goes once).
  try {
    ran += await queueChatReminders(db, new Date(), timeZone);
  } catch (error) {
    failure ??= error;
  }
  // Papers asked for and not sent, and files left to sort (each goes once per ask or file).
  try {
    ran += await queuePaperReminders(db, new Date());
  } catch (error) {
    failure ??= error;
  }
  if (failure) throw failure;
  return ran;
}
