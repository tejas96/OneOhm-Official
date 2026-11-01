'use client';

import { useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';

export const PEOPLE_KEY = ['people'] as const;
export const ROLES_KEY = ['roles'] as const;

export function usePeople() {
  return useQuery({
    queryKey: PEOPLE_KEY,
    queryFn: () => expectStatus(api.people.listPeople(), 200),
  });
}

export function useRoles() {
  return useQuery({
    queryKey: ROLES_KEY,
    queryFn: () => expectStatus(api.people.listRoles(), 200),
    staleTime: 60_000,
  });
}
