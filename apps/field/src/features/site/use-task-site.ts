import type { TaskSite, TrackingStatus } from '@oneohm/api-contracts';
import { unwrap } from '@oneohm/mobile-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, keys } from '@/api/api';
import { readLocation } from '@/features/attendance/location';

export const siteKeys = {
  task: (taskId: string) => ['site', 'task', taskId] as const,
  travel: (date: string) => ['site', 'travel', date] as const,
  claims: ['site', 'claims'] as const,
};

/** Check-in, check-out and visits for one task (PRD 4.2). */
export function useTaskSite(taskId: string) {
  return useQuery({
    queryKey: siteKeys.task(taskId),
    queryFn: () => unwrap(api.siteActivity.taskSite({ params: { id: taskId } })),
  });
}

export type Missed = 'denied' | 'nofix' | null;

/**
 * One reading of the phone's location, only when the person has agreed, the policy is
 * on and it is working hours; otherwise nothing is read at all.
 */
export async function readIfAllowed(tracking: TrackingStatus | undefined): Promise<{
  position: { latitude: number; longitude: number; accuracyM: number | null } | null;
  missed: Missed;
}> {
  if (tracking?.state !== 'on') return { position: null, missed: null };
  const reading = await readLocation();
  if (reading === 'denied') return { position: null, missed: 'denied' };
  if (!reading) return { position: null, missed: 'nofix' };
  return { position: reading, missed: null };
}

export function useSiteAction(taskId: string, kind: 'in' | 'out' | 'save') {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (tracking: TrackingStatus | undefined) => {
      const params = { id: taskId };
      if (kind === 'save') {
        const site = await unwrap(api.siteActivity.saveSiteLocation({ params, body: {} }));
        return { site, missed: null as Missed };
      }
      const { position, missed } = await readIfAllowed(tracking);
      const body = { position };
      const site = await unwrap(
        kind === 'in'
          ? api.siteActivity.siteCheckIn({ params, body })
          : api.siteActivity.siteCheckOut({ params, body }),
      );
      return { site, missed };
    },
    onSuccess: async ({ site }: { site: TaskSite; missed: Missed }) => {
      client.setQueryData(siteKeys.task(taskId), site);
      await client.invalidateQueries({ queryKey: ['site', 'travel'] });
      await client.invalidateQueries({ queryKey: keys.task(taskId) });
    },
  });
}
