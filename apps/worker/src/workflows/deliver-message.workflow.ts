import { proxyActivities } from '@temporalio/workflow';
import type { Activities } from '../activities';

const MAX_ATTEMPTS = 8;

const { deliverOutboxMessage } = proxyActivities<Activities>({
  startToCloseTimeout: '1 minute',
  retry: {
    initialInterval: '30 seconds',
    backoffCoefficient: 2,
    maximumInterval: '1 hour',
    maximumAttempts: MAX_ATTEMPTS,
  },
});

const { markOutboxFailed } = proxyActivities<Activities>({
  startToCloseTimeout: '30 seconds',
  retry: { maximumAttempts: 10 },
});

function reasonOf(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    return cause instanceof Error ? cause.message : error.message;
  }
  return String(error);
}

/** Delivers one outbox message, retrying temporary failures for about four hours. */
export async function deliverMessageWorkflow(outboxId: string): Promise<string> {
  try {
    return await deliverOutboxMessage(outboxId);
  } catch (error) {
    await markOutboxFailed(outboxId, `Gave up after ${MAX_ATTEMPTS} attempts: ${reasonOf(error)}`);
    return 'failed';
  }
}
