import { unwrap } from '@oneohm/mobile-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/api';
import { siteKeys } from '@/features/site/use-task-site';

/** The person's travel on a day, built from their site check-ins (PRD 4.3). */
export function useTravelDay(date: string) {
  return useQuery({
    queryKey: siteKeys.travel(date),
    queryFn: () => unwrap(api.siteActivity.myTravel({ query: { date } })),
  });
}

export function useMyClaims() {
  return useQuery({
    queryKey: siteKeys.claims,
    queryFn: () => unwrap(api.siteActivity.myTravelClaims()),
  });
}

/** Claim a day, or cancel a claim still waiting; both refresh the day and the list. */
export function useClaimActions() {
  const client = useQueryClient();
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['site', 'travel'] });
    await client.invalidateQueries({ queryKey: siteKeys.claims });
  };
  const claim = useMutation({
    mutationFn: (input: { workDate: string; note: string | null; projectId: string | null }) =>
      unwrap(api.siteActivity.claimTravel({ body: input })),
    onSuccess: refresh,
  });
  const cancel = useMutation({
    mutationFn: (id: string) =>
      unwrap(api.siteActivity.cancelTravelClaim({ params: { id }, body: {} })),
    onSuccess: refresh,
  });
  return { claim, cancel };
}
