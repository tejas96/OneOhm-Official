import { proxyActivities } from '@temporalio/workflow';
import type { Activities } from '../activities';
import { failureText } from './failure-text';

const {
  queuePaymentReminders,
  queueEscalations,
  queueApprovalEscalations,
  openMaintenanceVisits,
  closeForgottenDays,
  approveTravelClaims,
  alertFailedJob,
  queueCashReminders,
  clearOldLocations,
  clearOldJobRuns,
  watchMonthSheets,
} = proxyActivities<Activities>({
  startToCloseTimeout: '5 minutes',
  retry: { initialInterval: '1 minute', maximumAttempts: 5 },
});

/**
 * Runs one job; a job that still fails after its retries never stops the ones after it,
 * and tells the admin desk (live review A11). The alert is best effort: if it cannot be
 * sent either, the failed run in the job log is still there.
 */
async function settle(name: string, job: () => Promise<number>): Promise<number | null> {
  try {
    return await job();
  } catch (error) {
    try {
      await alertFailedJob(name, failureText(error));
    } catch {
      // The failed run is already kept in the job log.
    }
    return null;
  }
}

/**
 * Every morning: payment reminders to customers, late or stuck tasks and long-waiting
 * approvals pushed up, AMC visits due within a week opened as service requests, and
 * cash held too long. Days nobody ended are ended at the last activity and the person
 * and their approvers told (live review A1). Then clean automatic travel claims of earlier
 * days are approved as the system. Last, location readings past the retention
 * period lose their coordinates (PRD 4.3) and old job runs are cleared. Staff digests and the owner's
 * summary go out at their own times (timedRemindersWorkflow). Each run is kept.
 */
export async function dailyOperationsWorkflow(): Promise<Record<string, number | null>> {
  return {
    daysClosed: await settle('attendance_autoclose', closeForgottenDays),
    travelApproved: await settle('travel_auto_approve', approveTravelClaims),
    reminders: await settle('payment_reminders', queuePaymentReminders),
    escalations: await settle('escalations', queueEscalations),
    approvalEscalations: await settle('approval_escalations', queueApprovalEscalations),
    visits: await settle('maintenance_visits', openMaintenanceVisits),
    cashHolders: await settle('cash_reminders', queueCashReminders),
    locationsCleared: await settle('location_cleanup', clearOldLocations),
    runsCleared: await settle('job_runs_cleanup', clearOldJobRuns),
    // Last, once the night close and claim approvals are in: locked months changed since.
    monthRowsChanged: await settle('month_sheet_watch', watchMonthSheets),
  };
}
