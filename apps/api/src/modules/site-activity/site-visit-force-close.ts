import type { SiteVisit } from '@oneohm/api-contracts';
import { notify, projects, reportingLines, siteVisits } from '@oneohm/database';
import { canForceCloseVisit } from '@oneohm/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, forbidden, notFound } from '../../common/http/errors';
import type { Database } from '../../config/core.module';
import { oneVisitRecord } from './site-visit-end';
import { noteVisitEnded } from './site-visit-events';

/**
 * A manager ends someone's stuck visit and says why (live review S1). Allowed for whoever
 * manages the work it is on, the project's manager, or the person's own manager (see
 * `canForceCloseVisit`). Who closed it and why stay on the visit, in the project history
 * and in the audit log, and the person is told. The planned visit is not marked done:
 * nobody knows it happened.
 */
export async function forceCloseVisit(
  db: Database,
  actor: Actor,
  visitId: string,
  reason: string,
): Promise<SiteVisit> {
  const [found] = await db
    .select({ visit: siteVisits, projectManager: projects.managerUserId })
    .from(siteVisits)
    .leftJoin(projects, eq(projects.id, siteVisits.projectId))
    .where(eq(siteVisits.id, visitId));
  if (!found) throw notFound('That visit');
  const row = found.visit;
  if (row.userId === actor.userId)
    throw conflict('Check out of your own visit from the visit itself.', 'own');
  const [reports] = await db
    .select({ id: reportingLines.userId })
    .from(reportingLines)
    .where(
      and(eq(reportingLines.userId, row.userId), eq(reportingLines.managerUserId, actor.userId)),
    )
    .limit(1);
  const allowed = canForceCloseVisit({
    service: row.serviceRequestId !== null,
    capabilities: actor.capabilities,
    isProjectManager: found.projectManager === actor.userId,
    isReportingManager: Boolean(reports),
  });
  if (!allowed) throw forbidden('Only whoever manages this work can close the visit.');
  if (row.checkOutAt) throw conflict('This visit is already closed.', 'closed');
  const now = new Date();
  await db.transaction(async (tx) => {
    const [done] = await tx
      .update(siteVisits)
      .set({
        checkOutAt: now,
        closeKind: 'manager',
        closedByUserId: actor.userId,
        closeNote: reason,
        updatedAt: now,
      })
      .where(and(eq(siteVisits.id, visitId), isNull(siteVisits.checkOutAt)))
      .returning({ id: siteVisits.id });
    if (!done) throw conflict('This visit is already closed.', 'closed');
    await recordAudit(tx, actor.userId, 'site_visit.force_closed', 'site_visit', visitId, {
      userId: row.userId,
      reason,
    });
    await noteVisitEnded(tx, {
      visitId,
      projectId: row.projectId,
      taskId: row.taskId,
      userId: actor.userId,
      message: `Site visit closed by ${actor.fullName}: ${reason}`,
    });
    await notify(
      tx,
      { userId: row.userId },
      {
        kind: 'site_visit_closed',
        title: 'Your site visit was closed',
        body: `${actor.fullName} closed your open site visit: ${reason}`,
        dedupeKey: `site_visit_closed:${visitId}`,
      },
    );
  });
  return oneVisitRecord(db, visitId);
}
