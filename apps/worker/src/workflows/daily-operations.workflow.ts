import { proxyActivities } from '@temporalio/workflow';
import type { Activities } from '../activities';

const { queuePaymentReminders, queueStaffDigests, queueEscalations } = proxyActivities<Activities>({
  startToCloseTimeout: '5 minutes',
  retry: { initialInterval: '1 minute', maximumAttempts: 5 },
});

/**
 * Every morning: payment reminders to customers, a short digest to each person, and
 * late or stuck tasks pushed up to managers.
 */
export async function dailyOperationsWorkflow(): Promise<{
  reminders: number;
  digests: number;
  escalations: number;
}> {
  const reminders = await queuePaymentReminders();
  const digests = await queueStaffDigests();
  const escalations = await queueEscalations();
  return { reminders, digests, escalations };
}
