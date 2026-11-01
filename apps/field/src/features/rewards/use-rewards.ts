import { unwrap } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/api';
import { useCan } from '@/session/session-provider';

export const rewardKeys = { mine: ['me', 'rewards'] as const };

/** The person's own points, achievements, customer feedback and bonuses (PRD 4.7). */
export function useMyRewards() {
  const allowed = useCan('attendance.mark', 'leave.request');
  return useQuery({
    queryKey: rewardKeys.mine,
    queryFn: () => unwrap(api.engagement.myRewards()),
    enabled: allowed,
  });
}
