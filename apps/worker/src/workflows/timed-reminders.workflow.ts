import { proxyActivities } from '@temporalio/workflow';
import type { Activities } from '../activities';

const { runTimedReminders } = proxyActivities<Activities>({
  startToCloseTimeout: '5 minutes',
  retry: { initialInterval: '1 minute', maximumAttempts: 3 },
});

/**
 * Every few minutes: staff digests, follow-up reminders and the owner's summary go out
 * once a day, at the times set in Settings → Reminders (PRD 7.2).
 */
export async function timedRemindersWorkflow(): Promise<{ ran: number }> {
  return { ran: await runTimedReminders() };
}
