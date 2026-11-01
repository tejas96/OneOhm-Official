import { proxyActivities } from '@temporalio/workflow';
import type { Activities } from '../activities';

const { queueSlaAlerts } = proxyActivities<Activities>({
  startToCloseTimeout: '5 minutes',
  retry: { initialInterval: '1 minute', maximumAttempts: 3 },
});

/** Every hour: service requests about to miss, or past, a promised time alert the team. */
export async function serviceSlaWorkflow(): Promise<{ alerts: number }> {
  return { alerts: await queueSlaAlerts() };
}
