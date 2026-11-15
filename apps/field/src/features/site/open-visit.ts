import type { SiteVisit } from '@oneohm/api-contracts';

/** What to call an open visit in "You are still checked in for X": its task or request, else nothing. */
export function openVisitTitle(visit: Pick<SiteVisit, 'taskTitle' | 'projectCode'>): string {
  const title = visit.taskTitle?.trim();
  if (title) return title;
  return visit.projectCode?.trim() ?? '';
}
