import { unwrap } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/api';

export const STAGE_RATINGS_KEY = ['customer', 'stage-ratings'] as const;

/** Finished stages to rate, and the ratings already given. */
export function useStageRatings() {
  return useQuery({
    queryKey: STAGE_RATINGS_KEY,
    queryFn: () => unwrap(api.customerStageRatings.myStageRatings()),
  });
}
