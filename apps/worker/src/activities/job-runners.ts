import { clearOldJobRuns, type Database } from '@oneohm/database';
import type { JobName } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { openMaintenanceVisits } from './after-sales';
import { queueApprovalEscalations } from './approval-escalations';
import { queueCashReminders } from './cash-reminders';
import { queueEscalations } from './escalations';
import { queueFollowUpReminders } from './follow-up-reminders';
import { clearOldLocations } from './location-retention';
import { queueOwnerSummaries } from './owner-summary';
import { queuePaymentReminders } from './payment-reminders';
import { queueSlaAlerts } from './service-sla';
import { queueStaffDigests } from './staff-digest';

/** The jobs the worker runs on a schedule, each safe to run again (PRD 7.1). */
export type WorkerJob = Exclude<
  JobName,
  | 'message_delivery'
  | 'payment_link_sync'
  | 'final_payment_links'
  | 'incentive_sweep'
  | 'payout_sync'
>;

/** Each job's work, returning how many things it queued or changed. */
export function jobRunners(
  db: Database,
  timeZone: string,
): Readonly<Record<WorkerJob, () => Promise<number>>> {
  const today = () => todayIn(timeZone);
  return {
    payment_reminders: () => queuePaymentReminders(db, timeZone),
    staff_digests: () => queueStaffDigests(db, today()),
    owner_summaries: () => queueOwnerSummaries(db, today()),
    follow_up_reminders: () => queueFollowUpReminders(db, today()),
    escalations: () => queueEscalations(db, today()),
    approval_escalations: () => queueApprovalEscalations(db, timeZone),
    maintenance_visits: () => openMaintenanceVisits(db, today()),
    cash_reminders: () => queueCashReminders(db, today()),
    location_cleanup: () => clearOldLocations(db, today()),
    service_sla: () => queueSlaAlerts(db, new Date(), timeZone),
    job_runs_cleanup: () => clearOldJobRuns(db),
  };
}

export function isWorkerJob(name: string, jobs: object): name is WorkerJob {
  return Object.hasOwn(jobs, name);
}
