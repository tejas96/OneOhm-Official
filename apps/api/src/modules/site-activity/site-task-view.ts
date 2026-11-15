import type { TaskSite } from '@oneohm/api-contracts';
import { type DatabaseExecutor, siteVisits } from '@oneohm/database';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { trackingFor } from '../workforce/tracking';
import type { SiteTask } from './site-task';
import { leftVisitOf } from './site-visit-left';
import { checkInPoint, readVisits, visitRecords } from './site-visit-read';

/** What the task screen shows about the site: the visits, the person's open one, what they may do. */
export async function presentTaskSite(
  db: DatabaseExecutor,
  actor: Actor,
  task: SiteTask,
): Promise<TaskSite> {
  const [tracking, visits, mine, justLeft] = await Promise.all([
    trackingFor(db, actor.userId),
    readVisits(db, eq(siteVisits.taskId, task.id)),
    visitRecords(
      db,
      and(eq(siteVisits.userId, actor.userId), isNull(siteVisits.checkOutAt)) as SQL,
    ),
    leftVisitOf(db, actor.userId, { taskId: task.id }),
  ]);
  const openHere = visits.find(
    (item) => item.row.userId === actor.userId && item.row.checkOutAt === null,
  );
  return {
    taskId: task.id,
    kind: task.kind,
    siteLabel: task.siteLabel,
    siteAddress: task.siteAddress,
    siteLocated: task.site !== null,
    farFromSiteM: tracking.policy.travel.farFromSiteM,
    openVisit: mine[0] ?? null,
    visits: visits.map((item) => item.record),
    tracking: tracking.status,
    canSetSite:
      task.site === null &&
      task.assigneeUserId === actor.userId &&
      Boolean(openHere && checkInPoint(openHere.row)),
    sitePoint: task.site,
    siteFlagged: task.siteFlagged,
    canPinSite: task.assigneeUserId === actor.userId && Boolean(openHere),
    justLeft,
  };
}
