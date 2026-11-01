import { proxyActivities } from '@temporalio/workflow';
import type { Activities } from '../activities';

const { queuePaymentReminders, queueStaffDigests, queueEscalations, queueOwnerSummaries } =
  proxyActivities<Activities>({
    startToCloseTimeout: '5 minutes',
    retry: { initialInterval: '1 minute', maximumAttempts: 5 },
  });

/**
 * Every morning: payment reminders to customers, a short digest to each person, and
 * late or stuck tasks pushed up to managers, and the owner's summary of yesterday.
 */
export async function dailyOperationsWorkflow(): Promise<{
  reminders: number;
  digests: number;
  escalations: number;
  summaries: number;
}> {
  const reminders = await queuePaymentReminders();
  const digests = await queueStaffDigests();
  const escalations = await queueEscalations();
  const summaries = await queueOwnerSummaries();
  return { reminders, digests, escalations, summaries };
}
