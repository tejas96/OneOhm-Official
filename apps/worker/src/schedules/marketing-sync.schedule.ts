import { type Client, ScheduleNotFoundError, ScheduleOverlapPolicy } from '@temporalio/client';

export const MARKETING_SYNC_SCHEDULE_ID = 'oneohm-marketing-sync';

/**
 * Every 15 minutes, on the business clock. A run that is still going makes the next one wait
 * (skip). Created once; updated if it already exists.
 */
export async function ensureMarketingSyncSchedule(
  client: Client,
  options: { readonly taskQueue: string; readonly timeZone: string },
): Promise<void> {
  const spec = { cronExpressions: ['*/15 * * * *'], timezone: options.timeZone };
  const action = {
    type: 'startWorkflow' as const,
    workflowType: 'marketingSyncWorkflow',
    taskQueue: options.taskQueue,
  };
  const handle = client.schedule.getHandle(MARKETING_SYNC_SCHEDULE_ID);
  try {
    await handle.describe();
    await handle.update((current) => ({ ...current, spec, action }));
  } catch (error) {
    if (!(error instanceof ScheduleNotFoundError)) throw error;
    await client.schedule.create({
      scheduleId: MARKETING_SYNC_SCHEDULE_ID,
      spec,
      action,
      policies: { overlap: ScheduleOverlapPolicy.SKIP, catchupWindow: '20 minutes' },
    });
  }
}
