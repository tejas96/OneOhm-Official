import { type Client, ScheduleNotFoundError, ScheduleOverlapPolicy } from '@temporalio/client';

export const TIMED_REMINDERS_SCHEDULE_ID = 'oneohm-timed-reminders';

/**
 * Every five minutes, so a time set in Settings → Reminders is kept to within five
 * minutes. Created once; updated if it already exists.
 */
export async function ensureTimedRemindersSchedule(
  client: Client,
  options: { readonly taskQueue: string; readonly timeZone: string },
): Promise<void> {
  const spec = { cronExpressions: ['*/5 * * * *'], timezone: options.timeZone };
  const action = {
    type: 'startWorkflow' as const,
    workflowType: 'timedRemindersWorkflow',
    taskQueue: options.taskQueue,
  };
  const handle = client.schedule.getHandle(TIMED_REMINDERS_SCHEDULE_ID);
  try {
    await handle.describe();
    await handle.update((current) => ({ ...current, spec, action }));
  } catch (error) {
    if (!(error instanceof ScheduleNotFoundError)) throw error;
    await client.schedule.create({
      scheduleId: TIMED_REMINDERS_SCHEDULE_ID,
      spec,
      action,
      policies: { overlap: ScheduleOverlapPolicy.SKIP, catchupWindow: '10 minutes' },
    });
  }
}
