import { type Client, ScheduleNotFoundError, ScheduleOverlapPolicy } from '@temporalio/client';

export const DAILY_OPERATIONS_SCHEDULE_ID = 'oneohm-daily-operations';

/** 08:41 business time, every day. Created once; updated if it already exists. */
export async function ensureDailyOperationsSchedule(
  client: Client,
  options: { readonly taskQueue: string; readonly timeZone: string },
): Promise<void> {
  const spec = { cronExpressions: ['41 8 * * *'], timezone: options.timeZone };
  const action = {
    type: 'startWorkflow' as const,
    workflowType: 'dailyOperationsWorkflow',
    taskQueue: options.taskQueue,
  };
  const handle = client.schedule.getHandle(DAILY_OPERATIONS_SCHEDULE_ID);
  try {
    await handle.describe();
    await handle.update((current) => ({ ...current, spec, action }));
  } catch (error) {
    if (!(error instanceof ScheduleNotFoundError)) throw error;
    await client.schedule.create({
      scheduleId: DAILY_OPERATIONS_SCHEDULE_ID,
      spec,
      action,
      policies: { overlap: ScheduleOverlapPolicy.SKIP, catchupWindow: '6 hours' },
    });
  }
}
