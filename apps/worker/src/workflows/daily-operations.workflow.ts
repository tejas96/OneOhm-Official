import { proxyActivities } from '@temporalio/workflow';
import type { Activities } from '../activities';

const { queuePaymentReminders, queueStaffDigests } = proxyActivities<Activities>({
  startToCloseTimeout: '5 minutes',
  retry: { initialInterval: '1 minute', maximumAttempts: 5 },
});

/** Every morning: payment reminders to customers and a short digest to each person. */
export async function dailyOperationsWorkflow(): Promise<{ reminders: number; digests: number }> {
  const reminders = await queuePaymentReminders();
  const digests = await queueStaffDigests();
  return { reminders, digests };
}
