import { proxyActivities } from '@temporalio/workflow';
import type { Activities } from '../activities';

const { sweepDutyAlerts } = proxyActivities<Activities>({
  startToCloseTimeout: '4 minutes',
  retry: { initialInterval: '30 seconds', maximumAttempts: 2 },
});

/**
 * Every five minutes: the time-based duty alerts (not checked in, route gaps, visits open too
 * long or missed, travel claims waiting or unpaid). Each alert fires once (Duty Day step 5).
 */
export async function dutyAlertsWorkflow(): Promise<{ raised: number }> {
  return { raised: await sweepDutyAlerts() };
}
