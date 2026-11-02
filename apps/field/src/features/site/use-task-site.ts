import type { TaskSite, TrackingStatus } from '@oneohm/api-contracts';
import { unwrap } from '@oneohm/mobile-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, keys } from '@/api/api';
import { SITE } from '@/copy/site';
import { type Reading, readLocation } from '@/features/attendance/location';
import { readPreciseLocation } from '@/features/attendance/precise-location';

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
export async function readIfAllowed(
  tracking: TrackingStatus | undefined,
  options: { precise?: boolean; onProgress?: (accuracyM: number | null) => void } = {},
): Promise<{
  /** With the battery and connection at the reading, when the phone tells us. */
  position: Reading | null;
  missed: Missed;
}> {
  if (tracking?.state !== 'on') return { position: null, missed: null };
  const reading = options.precise
    ? await readPreciseLocation(options.onProgress)
    : await readLocation();
  if (reading === 'denied') return { position: null, missed: 'denied' };
  if (!reading) return { position: null, missed: 'nofix' };
  return { position: reading, missed: null };
}

export function useSiteAction(taskId: string, kind: 'in' | 'out' | 'save') {
  const client = useQueryClient();
  const [progress, setProgress] = useState<{ reading: boolean; accuracyM: number | null }>({
    reading: false,
    accuracyM: null,
  });
  const mutation = useMutation({
    mutationFn: async (tracking: TrackingStatus | undefined) => {
      const params = { id: taskId };
      if (kind === 'save') {
        const site = await unwrap(api.siteActivity.saveSiteLocation({ params, body: {} }));
        return { site, missed: null as Missed };
      }
      setProgress({ reading: true, accuracyM: null });
      const { position, missed } = await readIfAllowed(tracking, {
        precise: true,
        onProgress: (accuracyM) => setProgress({ reading: true, accuracyM }),
      }).finally(() => setProgress({ reading: false, accuracyM: null }));
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
  /** What the button says while the precise reading runs, else null. */
  const label = progress.reading ? SITE.finding(progress.accuracyM) : null;
  return { ...mutation, label };
}
