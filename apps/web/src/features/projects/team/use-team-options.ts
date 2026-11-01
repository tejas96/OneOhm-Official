'use client';

import { useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';

/** Active staff and contractors who can be put on a project (PRD 3.8). */
export function useTeamOptions(enabled = true) {
  return useQuery({
    queryKey: ['project-team-options'],
    queryFn: () => expectStatus(api.projectTeam.teamOptions(), 200),
    enabled,
    staleTime: 60_000,
  });
}
