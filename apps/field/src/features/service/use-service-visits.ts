import type { ServiceFinishInput, ServiceVisit, TrackingStatus } from '@oneohm/api-contracts';
import { unwrap } from '@oneohm/mobile-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/api';
import { type Missed, readIfAllowed } from '@/features/site/use-task-site';
import { useCan } from '@/session/session-provider';

/** Under 'site' so giving location consent (which refreshes 'site') refreshes these too. */
export const serviceKeys = {
  all: ['site', 'service'] as const,
  mine: ['site', 'service', 'mine'] as const,
  one: (id: string) => ['site', 'service', 'one', id] as const,
};

/** The person's open service requests, the most pressing first (PRD 5.5). */
export function useMyServiceVisits() {
  const allowed = useCan('service.manage', 'tasks.view_assigned');
  return useQuery({
    queryKey: serviceKeys.mine,
    queryFn: () => unwrap(api.serviceVisits.myServiceVisits()),
    enabled: allowed,
  });
}

export function useServiceVisit(id: string) {
  return useQuery({
    queryKey: serviceKeys.one(id),
    queryFn: () => unwrap(api.serviceVisits.serviceVisit({ params: { id } })),
    retry: false,
  });
}

function useSettle(id: string) {
  const client = useQueryClient();
  return async (visit: ServiceVisit) => {
    client.setQueryData(serviceKeys.one(id), visit);
    await client.invalidateQueries({ queryKey: serviceKeys.mine });
    await client.invalidateQueries({ queryKey: ['site', 'travel'] });
  };
}

/** Check in or out at the request's site; location is read only when it may be. */
export function useServiceSiteAction(id: string, kind: 'in' | 'out') {
  const settle = useSettle(id);
  return useMutation({
    mutationFn: async (tracking: TrackingStatus | undefined) => {
      const { position, missed } = await readIfAllowed(tracking);
      const params = { id };
      const visit = await unwrap(
        kind === 'in'
          ? api.serviceVisits.serviceCheckIn({ params, body: { position } })
          : api.serviceVisits.serviceCheckOut({ params, body: { position } }),
      );
      return { visit, missed };
    },
    onSuccess: ({ visit }: { visit: ServiceVisit; missed: Missed }) => settle(visit),
  });
}

/** Mark the work done or hand it back; still checked in, it checks out too. */
export function useFinishService(id: string) {
  const settle = useSettle(id);
  return useMutation({
    mutationFn: async (input: {
      readonly finish: Omit<ServiceFinishInput, 'position'>;
      readonly tracking: TrackingStatus | undefined;
    }) => {
      const { position } = await readIfAllowed(input.tracking);
      return unwrap(
        api.serviceVisits.finishServiceVisit({
          params: { id },
          body: { ...input.finish, position },
        }),
      );
    },
    onSuccess: settle,
  });
}
