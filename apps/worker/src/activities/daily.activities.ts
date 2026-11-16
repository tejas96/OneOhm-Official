import { alertJobFailed, type Database, recordJobRun } from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { jobRunners, type WorkerJob } from './job-runners';
import type { PayLinkSettings } from './payment-reminders';
import { runTimedReminders } from './timed-reminders';

/**
 * The scheduled jobs as Temporal activities. Every run is kept with its start, finish,
 * count or error (PRD 7.1 "workflow history and failure visibility"); a failure is
 * re-thrown so Temporal's retries still happen.
 */
export function dailyActivities(db: Database, timeZone: string, payLinks: PayLinkSettings) {
  const jobs = jobRunners(db, timeZone, payLinks);
  const run = (name: WorkerJob) => () => recordJobRun(db, name, jobs[name], String);
  return {
    queuePaymentReminders: run('payment_reminders'),
    queueEscalations: run('escalations'),
    queueApprovalEscalations: run('approval_escalations'),
    openMaintenanceVisits: run('maintenance_visits'),
    queueCashReminders: run('cash_reminders'),
    /** Days nobody ended are ended at the last activity, and the person and approvers told. */
    closeForgottenDays: run('attendance_autoclose'),
    /** Clean automatic travel claims of earlier days are approved; missed ones are made again. */
    approveTravelClaims: run('travel_auto_approve'),
    clearOldLocations: run('location_cleanup'),
    clearOldJobRuns: run('job_runs_cleanup'),
    queueSlaAlerts: run('service_sla'),
    /**
     * The time-based duty alerts, every five minutes. Kept in the job log only when it raised
     * something or failed, so the log shows work, not every quiet tick.
     */
    sweepDutyAlerts: () =>
      recordJobRun(
        db,
        'duty_alerts',
        jobs.duty_alerts,
        (raised) => (raised > 0 ? String(raised) : null),
        {
          quiet: true,
        },
      ),
    /** Locked month sheets compared with the facts, after the morning jobs (Duty Day step 7). */
    watchMonthSheets: run('month_sheet_watch'),
    /** A job that failed after every retry tells the admin desk (once a day per job). */
    alertFailedJob: (job: string, error: string) =>
      alertJobFailed(db, job, error, todayIn(timeZone)),
    /** Staff digests, follow-up reminders and the owner summary, at their set times. */
    runTimedReminders: () => runTimedReminders(db, timeZone, jobs),
  };
}
