'use client';

import type { LeadDetail } from '@oneohm/api-contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';
import { leadKeys } from './lead-labels';

type LeadPatch = NonNullable<Parameters<typeof api.crm.updateLead>[0]['body']>;
type ActivityInput = Parameters<typeof api.crm.addLeadActivity>[0]['body'];

/** Keeps the open lead and every lead list in step after a change. */
function useRefresh(id: string) {
  const queryClient = useQueryClient();
  return async (lead: LeadDetail) => {
    queryClient.setQueryData(leadKeys.detail(id), lead);
    await queryClient.invalidateQueries({
      queryKey: leadKeys.all,
      predicate: (query) => query.queryKey[1] !== 'detail',
    });
  };
}

export function useUpdateLead(id: string) {
  const refresh = useRefresh(id);
  return useMutation({
    mutationFn: (body: LeadPatch) =>
      expectStatus(api.crm.updateLead({ params: { id }, body }), 200),
    onSuccess: refresh,
  });
}

export function useLogActivity(id: string) {
  const refresh = useRefresh(id);
  return useMutation({
    mutationFn: (body: ActivityInput) =>
      expectStatus(api.crm.addLeadActivity({ params: { id }, body }), 201),
    onSuccess: refresh,
  });
}
