'use client';

import type { ChangeRequestSummary } from '@oneohm/api-contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';

export const DISCOM_KEY = ['discom'] as const;
export const CHANGE_REQUESTS_KEY = ['change-requests'] as const;

export function useDiscomDesk() {
  return useQuery({
    queryKey: [...DISCOM_KEY, 'desk'],
    queryFn: () => expectStatus(api.discom.discomDesk(), 200),
  });
}

export function useChangeRequests(query: {
  status?: ChangeRequestSummary['status'];
  propertyId?: string;
  projectId?: string;
}) {
  return useQuery({
    queryKey: [...CHANGE_REQUESTS_KEY, 'list', query],
    queryFn: () => expectStatus(api.discom.listChangeRequests({ query }), 200),
  });
}

export function useChangeRequest(id: string) {
  return useQuery({
    queryKey: [...CHANGE_REQUESTS_KEY, id],
    queryFn: () => expectStatus(api.discom.getChangeRequest({ params: { id } }), 200),
  });
}

/** A change request touches the desk, the site, the customer and the project's tasks. */
export function useRefreshDiscom() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [DISCOM_KEY, CHANGE_REQUESTS_KEY, ['customers'], ['project'], ['projects'], ['tasks']].map(
        (queryKey) => queryClient.invalidateQueries({ queryKey }),
      ),
    );
}
