import { type Database, recordJobRun } from '@oneohm/database';
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
    clearOldLocations: run('location_cleanup'),
    clearOldJobRuns: run('job_runs_cleanup'),
    queueSlaAlerts: run('service_sla'),
    /** Staff digests, follow-up reminders and the owner summary, at their set times. */
    runTimedReminders: () => runTimedReminders(db, timeZone, jobs),
  };
}
