'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';

export const CONTRACTORS_KEY = ['contractors'] as const;
export const WORK_ORDERS_KEY = ['work-orders'] as const;

export function useContractors(search: string) {
  return useQuery({
    queryKey: [...CONTRACTORS_KEY, 'list', search],
    queryFn: () =>
      expectStatus(api.contractors.listContractors({ query: search ? { search } : {} }), 200),
  });
}

export function useContractor(id: string) {
  return useQuery({
    queryKey: [...CONTRACTORS_KEY, id],
    queryFn: () => expectStatus(api.contractors.getContractor({ params: { id } }), 200),
  });
}

export function useCrewCandidates(enabled: boolean) {
  return useQuery({
    queryKey: ['crew-candidates'],
    queryFn: () => expectStatus(api.contractors.crewCandidates(), 200),
    enabled,
  });
}

export function useWorkOrder(id: string) {
  return useQuery({
    queryKey: [...WORK_ORDERS_KEY, id],
    queryFn: () => expectStatus(api.contractors.getWorkOrder({ params: { id } }), 200),
  });
}

/** Refreshes everything a contractor or work-order change can affect. */
export function useRefreshContractors() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: CONTRACTORS_KEY }),
      queryClient.invalidateQueries({ queryKey: WORK_ORDERS_KEY }),
      queryClient.invalidateQueries({ queryKey: ['crew-candidates'] }),
      queryClient.invalidateQueries({ queryKey: ['command-center'] }),
    ]);
}
