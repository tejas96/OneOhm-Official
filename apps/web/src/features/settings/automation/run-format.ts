import type { JobRunRecord } from '@oneohm/api-contracts';

/** How long a run took in milliseconds; null until it has both started and finished. */
export function took(run: Pick<JobRunRecord, 'startedAt' | 'finishedAt'>): number | null {
  if (!run.startedAt || !run.finishedAt) return null;
  return Math.max(0, Date.parse(run.finishedAt) - Date.parse(run.startedAt));
}

/** Whole minutes and leftover seconds, rounded to the nearest second. */
export function minutesAndSeconds(ms: number): { minutes: number; seconds: number } {
  const total = Math.round(ms / 1000);
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}

/** A failure nothing has put right since: these are counted and shown as "Failed only". */
export function needsAttention(run: Pick<JobRunRecord, 'status' | 'recovered'>): boolean {
  return run.status === 'failed' && !run.recovered;
}

/**
 * Running a timed job again does today's work, not the day it failed (message sending
 * resends that one message), so an older run says so before anyone clicks.
 */
export function runsTodaysJob(run: Pick<JobRunRecord, 'name' | 'createdAt'>, now: Date): boolean {
  if (run.name === 'message_delivery') return false;
  return new Date(run.createdAt).toDateString() !== now.toDateString();
}
