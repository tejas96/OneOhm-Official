/**
 * Scheduled and background jobs whose runs are kept (PRD 7.1 "workflow history and
 * failure visibility"). A retryable job is safe to run again by hand: each one only
 * sends what has not been sent.
 */
export const JOB_NAMES = [
  'payment_reminders',
  'staff_digests',
  'owner_summaries',
  'follow_up_reminders',
  'escalations',
  'approval_escalations',
  'maintenance_visits',
  'cash_reminders',
  'location_cleanup',
  'service_sla',
  'job_runs_cleanup',
  'message_delivery',
  'payment_link_sync',
  'final_payment_links',
  'incentive_sweep',
  'payout_sync',
  'onboarding_nudges',
  'file_questions',
  'sales_checks',
  'whatsapp_heartbeat',
] as const;
export type JobName = (typeof JOB_NAMES)[number];

/** Jobs the worker can run again on request. The rest repeat on their own in minutes. */
export const RETRYABLE_JOBS: readonly JobName[] = [
  'payment_reminders',
  'staff_digests',
  'owner_summaries',
  'follow_up_reminders',
  'escalations',
  'approval_escalations',
  'maintenance_visits',
  'cash_reminders',
  'location_cleanup',
  'service_sla',
  'message_delivery',
];

export const JOB_RUN_STATUSES = ['queued', 'running', 'succeeded', 'failed'] as const;
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number];

/** Runs are kept this long; older ones are cleared each morning. */
export const JOB_RUN_KEEP_DAYS = 30;

export function isRetryableJob(name: string): name is JobName {
  return (RETRYABLE_JOBS as readonly string[]).includes(name);
}

/** Kept error text: long enough for a database error after its query. */
export const JOB_ERROR_MAX = 4000;

/**
 * An error for the runs table (no stack, no secrets in URLs). The underlying cause
 * (a database error wrapped in "Failed query: …") comes first, so it is never cut off.
 */
export function jobErrorText(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth += 1) {
    const text = current instanceof Error ? current.message : String(current);
    if (text && !messages.includes(text)) messages.unshift(text);
    current = current instanceof Error ? current.cause : undefined;
  }
  return messages
    .join('\n\n')
    .replace(/https?:\/\/\S+/g, '[link]')
    .slice(0, JOB_ERROR_MAX);
}

/** Jobs that run once a day; one with no run for over a day means the worker is stopped. */
export const DAILY_JOBS: readonly JobName[] = [
  'payment_reminders',
  'staff_digests',
  'owner_summaries',
  'follow_up_reminders',
  'escalations',
  'approval_escalations',
  'maintenance_visits',
  'cash_reminders',
  'location_cleanup',
  'job_runs_cleanup',
];
const MISSING_AFTER_MS = 26 * 3_600_000;

/** Daily jobs whose latest run is more than 26 hours old, or that have no run at all. */
export function missingDailyJobs(
  lastRun: ReadonlyMap<string, Date>,
  now = new Date(),
): readonly JobName[] {
  return DAILY_JOBS.filter((name) => {
    const at = lastRun.get(name);
    return !at || now.getTime() - at.getTime() > MISSING_AFTER_MS;
  });
}

interface RunFacts {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly subjectId: string | null;
}

/**
 * Failures the same job put right later on its own (an automatic retry, the next tick
 * of a background loop) or by a retry. A message's failure counts only for that message.
 */
export function recoveredFailures(rows: readonly RunFacts[]): ReadonlySet<string> {
  const key = (row: RunFacts) => `${row.name}:${row.subjectId ?? ''}`;
  const lastSuccess = new Map<string, number>();
  for (const row of rows) {
    if (row.status !== 'succeeded') continue;
    const at = row.createdAt.getTime();
    if (at > (lastSuccess.get(key(row)) ?? Number.NEGATIVE_INFINITY)) lastSuccess.set(key(row), at);
  }
  const recovered = new Set<string>();
  for (const row of rows) {
    const success = lastSuccess.get(key(row));
    if (row.status === 'failed' && success !== undefined && success > row.createdAt.getTime())
      recovered.add(row.id);
  }
  return recovered;
}

/** Failures still needing attention first, then the newest. */
export function compareRuns(
  left: { readonly status: JobRunStatus; readonly createdAt: string; readonly recovered?: boolean },
  right: {
    readonly status: JobRunStatus;
    readonly createdAt: string;
    readonly recovered?: boolean;
  },
): number {
  const open = (run: { readonly status: JobRunStatus; readonly recovered?: boolean }) =>
    Number(run.status === 'failed' && !run.recovered);
  return open(right) - open(left) || right.createdAt.localeCompare(left.createdAt);
}
