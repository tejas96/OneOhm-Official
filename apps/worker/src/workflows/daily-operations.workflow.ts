import { proxyActivities } from '@temporalio/workflow';
import type { Activities } from '../activities';

const {
  queuePaymentReminders,
  queueEscalations,
  queueApprovalEscalations,
  openMaintenanceVisits,
  queueCashReminders,
  clearOldLocations,
  clearOldJobRuns,
} = proxyActivities<Activities>({
  startToCloseTimeout: '5 minutes',
  retry: { initialInterval: '1 minute', maximumAttempts: 5 },
});

/** Runs one job; a job that still fails after its retries never stops the ones after it. */
async function settle(job: () => Promise<number>): Promise<number | null> {
  try {
    return await job();
  } catch {
    return null;
  }
}

/**
 * Every morning: payment reminders to customers, late or stuck tasks and long-waiting
 * approvals pushed up, AMC visits due within a week opened as service requests, and
 * cash held too long. Last, location readings past the retention period lose their
 * coordinates (PRD 4.3) and old job runs are cleared. Staff digests and the owner's
 * summary go out at their own times (timedRemindersWorkflow). Each run is kept.
 */
export async function dailyOperationsWorkflow(): Promise<Record<string, number | null>> {
  return {
    reminders: await settle(queuePaymentReminders),
    escalations: await settle(queueEscalations),
    approvalEscalations: await settle(queueApprovalEscalations),
    visits: await settle(openMaintenanceVisits),
    cashHolders: await settle(queueCashReminders),
    locationsCleared: await settle(clearOldLocations),
    runsCleared: await settle(clearOldJobRuns),
  };
}
