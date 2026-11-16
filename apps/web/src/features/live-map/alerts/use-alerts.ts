'use client';

import type { DutyAlert, LiveAlerts } from '@oneohm/api-contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';
import { LIVE_REFRESH_MS, LIVE_SITES_KEY, LIVE_TEAM_KEY } from '../use-live';

export const LIVE_ALERTS_KEY = ['live', 'alerts'] as const;

/** Open duty alerts about the people the manager looks after; refreshes with the map. */
export function useLiveAlerts() {
  return useQuery({
    queryKey: LIVE_ALERTS_KEY,
    queryFn: () => expectStatus(api.liveMap.liveAlerts(), 200),
    refetchInterval: LIVE_REFRESH_MS,
    refetchOnWindowFocus: true,
  });
}

const withAlert = (
  data: LiveAlerts | undefined,
  id: string,
  change: (a: DutyAlert) => DutyAlert | null,
) =>
  data && {
    alerts: data.alerts.flatMap((alert) => {
      if (alert.id !== id) return [alert];
      const next = change(alert);
      return next ? [next] : [];
    }),
  };

/** Seen: the alert stays, quieter. Shown at once; the server's answer replaces it. */
export function useSeeAlert() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      expectStatus(api.liveMap.seeAlert({ params: { id }, body: {} }), 200),
    onMutate: (id) => {
      client.setQueryData<LiveAlerts>(LIVE_ALERTS_KEY, (data) =>
        withAlert(data, id, (alert) => ({
          ...alert,
          seenAt: alert.seenAt ?? new Date().toISOString(),
        })),
      );
    },
    onSuccess: (saved) =>
      client.setQueryData<LiveAlerts>(LIVE_ALERTS_KEY, (data) =>
        withAlert(data, saved.id, () => saved),
      ),
    onError: () => client.invalidateQueries({ queryKey: LIVE_ALERTS_KEY }),
  });
}

/** Resolve: the alert leaves the feed at once, and the pin's badge counts one fewer. */
export function useResolveAlert() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      expectStatus(api.liveMap.resolveAlert({ params: { id }, body: {} }), 200),
    onMutate: (id) => {
      const before = client.getQueryData<LiveAlerts>(LIVE_ALERTS_KEY);
      client.setQueryData<LiveAlerts>(LIVE_ALERTS_KEY, (data) => withAlert(data, id, () => null));
      return { before };
    },
    onError: (_error, _id, context) => {
      if (context?.before) client.setQueryData(LIVE_ALERTS_KEY, context.before);
    },
    onSettled: () => client.invalidateQueries({ queryKey: LIVE_TEAM_KEY }),
  });
}

/** Send nearest: up to five free people near a site, nearest first. */
export function useNearest(siteId: string | null) {
  return useQuery({
    queryKey: ['live', 'nearest', siteId],
    queryFn: () => expectStatus(api.liveMap.nearestToSite({ params: { id: siteId ?? '' } }), 200),
    enabled: siteId !== null,
    staleTime: 15_000,
  });
}

/** Gives the site's job to a person; the site's pin and the alerts refresh. */
export function useAssignSite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ siteId, userId }: { siteId: string; userId: string }) =>
      expectStatus(api.liveMap.assignSite({ params: { id: siteId }, body: { userId } }), 200),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: LIVE_SITES_KEY }),
        client.invalidateQueries({ queryKey: LIVE_TEAM_KEY }),
        client.invalidateQueries({ queryKey: LIVE_ALERTS_KEY }),
        client.invalidateQueries({ queryKey: ['live', 'nearest'] }),
      ]);
    },
  });
}
