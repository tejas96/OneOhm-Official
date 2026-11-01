import { proxyActivities } from '@temporalio/workflow';
import type { Activities } from '../activities';

const {
  queuePaymentReminders,
  queueStaffDigests,
  queueEscalations,
  queueOwnerSummaries,
  openMaintenanceVisits,
  queueCashReminders,
  clearOldLocations,
} = proxyActivities<Activities>({
  startToCloseTimeout: '5 minutes',
  retry: { initialInterval: '1 minute', maximumAttempts: 5 },
});

/**
 * Every morning: payment reminders to customers, a short digest to each person, and
 * late or stuck tasks pushed up to managers, the owner's summary of yesterday, and AMC
 * visits due within a week opened as service requests, and cash held too long. Last,
 * location readings past the retention period lose their coordinates (PRD 4.3).
 */
export async function dailyOperationsWorkflow(): Promise<{
  reminders: number;
  digests: number;
  escalations: number;
  summaries: number;
  visits: number;
  cashHolders: number;
  locationsCleared: number;
}> {
  const reminders = await queuePaymentReminders();
  const digests = await queueStaffDigests();
  const escalations = await queueEscalations();
  const summaries = await queueOwnerSummaries();
  const visits = await openMaintenanceVisits();
  const cashHolders = await queueCashReminders();
  const locationsCleared = await clearOldLocations();
  return { reminders, digests, escalations, summaries, visits, cashHolders, locationsCleared };
}
