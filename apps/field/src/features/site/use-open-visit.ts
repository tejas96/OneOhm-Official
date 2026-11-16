import { unwrap } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/api';
import { useCan } from '@/session/session-provider';

/** Under 'site' so every check-in and check-out refreshes it. */
export const openVisitKey = ['site', 'open-visit'] as const;

/** The person's open site visit anywhere, for the Today card; null when not checked in. */
export function useOpenVisit() {
  const allowed = useCan('tasks.complete', 'tasks.view_assigned');
  return useQuery({
    queryKey: openVisitKey,
    queryFn: async () => (await unwrap(api.siteActivity.myOpenVisit())).visit,
    enabled: allowed,
  });
}
