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

/** An error as one short line for the runs table (no stack, no secrets in URLs). */
export function jobErrorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/https?:\/\/\S+/g, '[link]').slice(0, 500);
}

/** Failures first, then the newest. */
export function compareRuns(
  left: { readonly status: JobRunStatus; readonly createdAt: string },
  right: { readonly status: JobRunStatus; readonly createdAt: string },
): number {
  const failed = Number(right.status === 'failed') - Number(left.status === 'failed');
  return failed || right.createdAt.localeCompare(left.createdAt);
}
