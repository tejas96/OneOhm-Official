import type { LiveSite } from '@oneohm/api-contracts';
import { type DatabaseExecutor, workLocations } from '@oneohm/database';
import { liveSiteStatus, selectDutySites } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { type SiteCandidate, siteCandidates } from '../site-activity/site-candidates';
import type { VisitWithSite } from '../site-activity/site-visit-read';
import { loadPolicy } from '../workforce/policy';

/** No cap on the map: the phone's 18-fence limit is for one phone, not for the team. */
const NO_CAP = Number.MAX_SAFE_INTEGER;

/** Minutes after midnight in the business time zone. */
export function minutesInZone(at: Date, timeZone: string): number {
  const [hours = 0, minutes = 0] = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  })
    .format(at)
    .split(':')
    .map(Number);
  return hours * 60 + minutes;
}

const workOf = (visit: VisitWithSite) => visit.row.taskId ?? visit.row.serviceRequestId;

export interface TeamSites {
  readonly sites: LiveSite[];
  /** Today's site ids by assignee. */
  readonly byPerson: Map<string, Set<string>>;
}

/**
 * Today's customer sites for the people: each person's own selection (`selectDutySites`, the
 * same rule their phone fences by), merged across the team, plus any site where one of them
 * is checked in now or was today. The status comes from those visits and the planned start.
 */
export async function teamSites(
  db: DatabaseExecutor,
  ids: readonly string[],
  today: string,
  nowMin: number,
  visits: readonly VisitWithSite[],
): Promise<TeamSites> {
  const [policy, candidates] = await Promise.all([loadPolicy(db), siteCandidates(db, ids)]);
  const radiusM = policy.travel.siteFenceM;
  const meta = new Map<string, SiteCandidate>(candidates.map((item) => [item.id, item]));
  const sites = new Map<string, LiveSite>();
  const byPerson = new Map<string, Set<string>>();
  const assign = (siteId: string, userId: string) => {
    byPerson.set(userId, (byPerson.get(userId) ?? new Set()).add(siteId));
    const site = sites.get(siteId);
    if (site && !site.assigneeIds.includes(userId)) site.assigneeIds.push(userId);
  };
  const add = (site: Omit<LiveSite, 'status' | 'assigneeIds'>, userId: string) => {
    if (!sites.has(site.id)) sites.set(site.id, { ...site, status: 'planned', assigneeIds: [] });
    assign(site.id, userId);
  };
  for (const userId of ids) {
    const own = candidates.filter((item) => item.assigneeUserId === userId);
    for (const site of selectDutySites(own, today, radiusM, NO_CAP)) {
      const item = meta.get(site.id);
      add(
        {
          ...site,
          label: item?.title ?? site.label,
          siteLabel: site.label,
          customerName: item?.customerName ?? null,
          plannedStartMin: item?.startsByDay.get(today) ?? null,
          projectId: item?.projectId ?? null,
        },
        userId,
      );
    }
  }
  for (const visit of visits) {
    const id = workOf(visit);
    if (!id || !visit.site) continue;
    add(
      {
        id,
        kind: visit.row.kind,
        label: visit.record.taskTitle ?? visit.record.siteLabel ?? visit.row.kind,
        siteLabel: visit.record.siteLabel ?? '',
        customerName: meta.get(id)?.customerName ?? null,
        latitude: visit.site.latitude,
        longitude: visit.site.longitude,
        radiusM,
        plannedStartMin: meta.get(id)?.startsByDay.get(today) ?? null,
        projectId: visit.row.serviceRequestId ? null : visit.row.projectId,
      },
      visit.row.userId,
    );
  }
  for (const site of sites.values()) {
    const at = visits.filter((visit) => workOf(visit) === site.id);
    site.status = liveSiteStatus({
      open: at.some((visit) => !visit.row.checkOutAt),
      visitedToday: at.some((visit) => visit.row.workDate === today && visit.row.checkOutAt),
      plannedStartMin: site.plannedStartMin,
      nowMin,
    });
  }
  return { sites: [...sites.values()], byPerson };
}

/** The work places (office, store) as soft circles. */
export async function activeOffices(db: DatabaseExecutor) {
  const rows = await db.select().from(workLocations).where(eq(workLocations.active, true));
  return rows.map(({ id, name, latitude, longitude, radiusM }) => ({
    id,
    name,
    latitude,
    longitude,
    radiusM,
  }));
}
