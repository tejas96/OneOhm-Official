import {
  type DatabaseExecutor,
  notify,
  projectActivities,
  projectChanges,
  projects,
  quotations,
} from '@oneohm/database';
import { and, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';

/** The approved change a quotation revision carries, if any. */
export async function changeAwaiting(db: DatabaseExecutor, quotationId: string) {
  const [found] = await db
    .select({ id: projectChanges.id, number: projectChanges.number })
    .from(projectChanges)
    .where(and(eq(projectChanges.quotationId, quotationId), eq(projectChanges.status, 'approved')))
    .limit(1);
  return found ?? null;
}

/**
 * The customer said no to the revision that carries a change (PRD 3.15): the change
 * closes as rejected and the project stays exactly as it was.
 */
export async function changeTurnedDown(
  db: DatabaseExecutor,
  quotationId: string,
  reason: string,
  userId: string,
): Promise<void> {
  const [found] = await db
    .select({ change: projectChanges, project: projects })
    .from(projectChanges)
    .innerJoin(projects, eq(projects.id, projectChanges.projectId))
    .where(and(eq(projectChanges.quotationId, quotationId), eq(projectChanges.status, 'approved')))
    .limit(1);
  if (!found) return;
  const { change, project } = found;
  await db
    .update(projectChanges)
    .set({
      status: 'rejected',
      closeReason: reason,
      closedAt: new Date(),
      closedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(eq(projectChanges.id, change.id));
  const message = `The customer did not accept change ${change.number}: ${reason}. The project stays as it was.`;
  await db
    .insert(projectActivities)
    .values({ projectId: project.id, kind: 'scope_change', message, userId });
  await recordAudit(db, userId, 'project.change_rejected', 'project', project.id, {
    changeId: change.id,
    reason,
  });
  const told = new Set([change.raisedByUserId, project.managerUserId]);
  for (const person of told) {
    if (!person || person === userId) continue;
    await notify(
      db,
      { userId: person },
      {
        kind: 'project_change',
        title: `${project.code}: change ${change.number} not accepted`,
        body: message,
        subject: { type: 'project', id: project.id, projectId: project.id },
        dedupeKey: `project_change_rejected:${change.id}`,
      },
    );
  }
}

/**
 * Once another revision of the same quotation is accepted (a survey revision, say), open
 * changes priced on the old one no longer fit: they close as withdrawn, with the reason,
 * and can be raised again on the new price.
 */
export async function closeStaleChanges(
  db: DatabaseExecutor,
  acceptedId: string,
  number: string,
  userId: string,
): Promise<void> {
  const sameNumber = db
    .select({ id: quotations.id })
    .from(quotations)
    .where(eq(quotations.number, number));
  const stale = await db
    .select({
      id: projectChanges.id,
      projectId: projectChanges.projectId,
      n: projectChanges.number,
    })
    .from(projectChanges)
    .where(
      and(
        inArray(projectChanges.status, ['raised', 'approved']),
        inArray(projectChanges.fromQuotationId, sameNumber),
        or(isNull(projectChanges.quotationId), ne(projectChanges.quotationId, acceptedId)),
      ),
    );
  for (const change of stale) {
    const reason =
      'Another revision of this quotation was accepted first; raise the change again on the new price.';
    await db
      .update(projectChanges)
      .set({
        status: 'withdrawn',
        closeReason: reason,
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projectChanges.id, change.id));
    await db.insert(projectActivities).values({
      projectId: change.projectId,
      kind: 'scope_change',
      message: `Change ${change.n} closed: ${reason}`,
      userId,
    });
  }
}
