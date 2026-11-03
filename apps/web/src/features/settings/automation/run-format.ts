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
