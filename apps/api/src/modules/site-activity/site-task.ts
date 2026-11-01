import { type DatabaseExecutor, projects, projectTasks, properties } from '@oneohm/database';
import { type GeoPoint, type SiteVisitKind, siteVisitKindOf } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { forbidden, notFound } from '../../common/http/errors';
import { canViewTask } from '../projects/task-access';

export interface SiteTask {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly assigneeUserId: string | null;
  readonly projectId: string;
  readonly projectCode: string;
  readonly managerUserId: string | null;
  readonly propertyId: string;
  readonly siteLabel: string;
  readonly site: GeoPoint | null;
  readonly kind: SiteVisitKind | null;
}

/** A task with its project and the customer's site, checked for who may see it. */
export async function loadSiteTask(
  db: DatabaseExecutor,
  actor: Actor,
  taskId: string,
): Promise<SiteTask> {
  const [row] = await db
    .select({
      task: projectTasks,
      projectCode: projects.code,
      managerUserId: projects.managerUserId,
      propertyId: properties.id,
      siteLabel: properties.label,
      city: properties.city,
      latitude: properties.latitude,
      longitude: properties.longitude,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .where(eq(projectTasks.id, taskId))
    .limit(1);
  if (!row) throw notFound('That task');
  if (!canViewTask(actor, row.task)) throw forbidden();
  return {
    id: row.task.id,
    title: row.task.title,
    status: row.task.status,
    assigneeUserId: row.task.assigneeUserId,
    projectId: row.task.projectId,
    projectCode: row.projectCode,
    managerUserId: row.managerUserId,
    propertyId: row.propertyId,
    siteLabel: `${row.siteLabel}, ${row.city}`,
    site:
      row.latitude !== null && row.longitude !== null
        ? { latitude: row.latitude, longitude: row.longitude }
        : null,
    kind: siteVisitKindOf(row.task),
  };
}
