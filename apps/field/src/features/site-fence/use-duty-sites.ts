import { unwrap } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { api, keys } from '@/api/api';
import { useMyServiceVisits } from '@/features/service/use-service-visits';

/** Under 'site' so a consent change refreshes it like the other site queries. */
export const dutySiteKeys = { mine: ['site', 'duty-sites'] as const };

/**
 * Today's sites with a saved pin where the person has work (empty when automatic visits are
 * off). It is read again when the tasks or the service visits are, so a job given or moved
 * today changes what the phone watches.
 */
export function useDutySites(enabled: boolean) {
  const tasks = useQuery({
    queryKey: keys.tasks,
    queryFn: () => unwrap(api.tasks.myTasks()),
    enabled,
  });
  const services = useMyServiceVisits();
  const sites = useQuery({
    queryKey: dutySiteKeys.mine,
    queryFn: () => unwrap(api.siteActivity.myDutySites()),
    enabled,
  });
  return {
    sites: sites.data,
    refetch: sites.refetch,
    /** Changes whenever the person's jobs were read again. */
    jobsStamp: `${tasks.dataUpdatedAt}:${services.dataUpdatedAt}`,
  };
}
