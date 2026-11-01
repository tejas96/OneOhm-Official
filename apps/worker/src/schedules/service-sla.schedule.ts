import { type Client, ScheduleNotFoundError, ScheduleOverlapPolicy } from '@temporalio/client';

export const SERVICE_SLA_SCHEDULE_ID = 'oneohm-service-sla';

/**
 * At 17 minutes past every hour, so service levels counted in hours are watched within
 * the hour (PRD 7.2). Created once; updated if it already exists.
 */
export async function ensureServiceSlaSchedule(
  client: Client,
  options: { readonly taskQueue: string; readonly timeZone: string },
): Promise<void> {
  const spec = { cronExpressions: ['17 * * * *'], timezone: options.timeZone };
  const action = {
    type: 'startWorkflow' as const,
    workflowType: 'serviceSlaWorkflow',
    taskQueue: options.taskQueue,
  };
  const handle = client.schedule.getHandle(SERVICE_SLA_SCHEDULE_ID);
  try {
    await handle.describe();
    await handle.update((current) => ({ ...current, spec, action }));
  } catch (error) {
    if (!(error instanceof ScheduleNotFoundError)) throw error;
    await client.schedule.create({
      scheduleId: SERVICE_SLA_SCHEDULE_ID,
      spec,
      action,
      policies: { overlap: ScheduleOverlapPolicy.SKIP, catchupWindow: '1 hour' },
    });
  }
}
