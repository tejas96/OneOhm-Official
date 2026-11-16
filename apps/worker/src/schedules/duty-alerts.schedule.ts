import { type Client, ScheduleNotFoundError, ScheduleOverlapPolicy } from '@temporalio/client';

export const DUTY_ALERTS_SCHEDULE_ID = 'oneohm-duty-alerts';

/**
 * Every five minutes, so a missed check-in, a silent phone or a missed visit is raised
 * within five minutes (Duty Day step 5). Created once; updated if it already exists.
 */
export async function ensureDutyAlertsSchedule(
  client: Client,
  options: { readonly taskQueue: string; readonly timeZone: string },
): Promise<void> {
  const spec = { cronExpressions: ['*/5 * * * *'], timezone: options.timeZone };
  const action = {
    type: 'startWorkflow' as const,
    workflowType: 'dutyAlertsWorkflow',
    taskQueue: options.taskQueue,
  };
  const handle = client.schedule.getHandle(DUTY_ALERTS_SCHEDULE_ID);
  try {
    await handle.describe();
    await handle.update((current) => ({ ...current, spec, action }));
  } catch (error) {
    if (!(error instanceof ScheduleNotFoundError)) throw error;
    await client.schedule.create({
      scheduleId: DUTY_ALERTS_SCHEDULE_ID,
      spec,
      action,
      policies: { overlap: ScheduleOverlapPolicy.SKIP, catchupWindow: '10 minutes' },
    });
  }
}
