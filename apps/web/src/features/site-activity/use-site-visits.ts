'use client';

import { useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';
import { useCan } from '@/providers/current-user';

export const siteVisitKeys = {
  project: (projectId: string) => ['site-visits', 'project', projectId] as const,
};

/** Every check-in on a project's site, newest first (people who see all projects). */
export function useProjectSiteVisits(projectId: string) {
  const allowed = useCan('projects.view_all', 'tasks.approve');
  return useQuery({
    queryKey: siteVisitKeys.project(projectId),
    queryFn: () =>
      expectStatus(api.siteActivity.projectSiteVisits({ params: { id: projectId } }), 200),
    enabled: allowed,
    staleTime: 60_000,
  });
}
