'use client';

import type { ApprovalItem } from '@oneohm/api-contracts';
import { useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';

/** Everything this person may say yes to, as the server judges it (rights, money limits, own requests). */
export function useMyApprovals() {
  return useQuery({
    queryKey: ['approvals', 'mine'],
    queryFn: () => expectStatus(api.businessSettings.myApprovals(), 200),
    refetchInterval: 60_000,
  });
}

/**
 * The ids of one kind this person may decide. A page shows Approve only for these, so it
 * follows the same rule as the inbox: within a money limit the everyday right is enough,
 * and a bonus's own sharers never decide it.
 */
export function useMayDecide(kind: ApprovalItem['kind']): ReadonlySet<string> {
  const query = useMyApprovals();
  return new Set((query.data ?? []).filter((item) => item.kind === kind).map((item) => item.id));
}
