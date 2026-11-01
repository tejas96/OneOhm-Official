'use client';

import { useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';

export const SKILLS_KEY = ['skills'] as const;

/** Every skill, switched-off ones included, in the owner's order (PRD 3.7). */
export function useSkills() {
  return useQuery({
    queryKey: SKILLS_KEY,
    queryFn: () => expectStatus(api.skills.listSkills(), 200),
    staleTime: 60_000,
  });
}
