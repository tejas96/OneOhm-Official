import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { notifyCover, notifyHolders } from './notify';
import { leads } from './schema/crm.schema';
import { projects } from './schema/projects.schema';
import type { visits } from './schema/visits.schema';

type VisitRow = typeof visits.$inferSelect;

/**
 * Tells the person a visit belongs to (the crew's first person, else the project manager or
 * the lead's owner), or whoever covers for them; with nobody named, those who manage that kind
 * of work. Used by the API and the worker, so both alert the same people.
 */
export async function alertVisitOwner(
  db: DatabaseExecutor,
  visit: Pick<
    VisitRow,
    'id' | 'kind' | 'taskId' | 'projectId' | 'leadId' | 'serviceRequestId' | 'crewUserIds'
  >,
  notice: {
    readonly kind: string;
    readonly title: string;
    readonly body: string;
    readonly key: string;
  },
): Promise<void> {
  let owner: string | null = visit.crewUserIds[0] ?? null;
  if (!owner && visit.projectId) {
    const [project] = await db
      .select({ manager: projects.managerUserId })
      .from(projects)
      .where(eq(projects.id, visit.projectId));
    owner = project?.manager ?? null;
  }
  if (!owner && visit.leadId) {
    const [lead] = await db
      .select({ owner: leads.ownerUserId })
      .from(leads)
      .where(eq(leads.id, visit.leadId));
    owner = lead?.owner ?? null;
  }
  const service = visit.kind === 'service' || visit.kind === 'amc';
  const capability = service ? 'service.manage' : visit.leadId ? 'leads.manage' : 'projects.manage';
  const subject = visit.taskId
    ? { type: 'task' as const, id: visit.taskId, projectId: visit.projectId }
    : visit.serviceRequestId
      ? { type: 'service_request' as const, id: visit.serviceRequestId, projectId: visit.projectId }
      : visit.leadId
        ? { type: 'lead' as const, id: visit.leadId }
        : undefined;
  const base = {
    kind: notice.kind,
    title: notice.title,
    body: notice.body,
    ...(subject ? { subject } : {}),
    dedupeKey: notice.key,
  };
  if (owner) await notifyCover(db, owner, capability, base);
  else await notifyHolders(db, capability, base);
}
