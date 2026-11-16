import type { SiteVisit } from '@oneohm/api-contracts';
import {
  alertVisitOwner,
  type DutyAlertInput,
  projectActivities,
  projectTasks,
  raiseDutyAlert,
  serviceRequests,
  siteVisits,
  visits,
} from '@oneohm/database';
import { canExplainLeaving, LEAVE_REASON_WORDS, type LeaveReason } from '@oneohm/domain';
import { and, eq, isNull } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import type { Database } from '../../config/core.module';
import { afterLeaveReason, safely } from '../visit-news/visit-news-send';
import { oneVisitRecord } from './site-visit-end';
import { readVisits } from './site-visit-read';

/** The alert feed's `job_left_unfinished` for the visit (its notice went out already). */
function feedAlert(
  actor: Actor,
  row: typeof siteVisits.$inferSelect,
  record: SiteVisit,
  reason: LeaveReason,
): DutyAlertInput {
  const what = record.taskTitle ?? 'the site';
  return {
    kind: 'job_left_unfinished',
    personId: actor.userId,
    subjectType: 'site_visit',
    subjectId: row.id,
    day: row.workDate,
    title: `${actor.fullName}: left ${record.siteLabel ?? 'the site'} unfinished`,
    body: `${what}: ${LEAVE_REASON_WORDS[reason]}.`,
    detail: { visitId: row.id, label: what, reason },
  };
}

/**
 * The person says why they left a site before the job was done (Duty Day step 3). Only for
 * their own closed visit, ended by a tap, the fence or the route, whose task is not complete
 * and not in review (or whose request is not resolved), and only once per visit. It is kept
 * on the visit and in the project history, and the manager is told: the project's manager for
 * a task, and the crew's lead (else whoever manages service) for a service request, with
 * cover. The person who left is never the one told.
 */
export async function giveLeaveReason(
  db: Database,
  actor: Actor,
  visitId: string,
  reason: LeaveReason,
): Promise<SiteVisit> {
  const [found] = await readVisits(db, eq(siteVisits.id, visitId));
  // Someone else's visit looks like no visit at all.
  if (!found || found.row.userId !== actor.userId) throw notFound('That visit');
  const { row, record } = found;
  if (!row.checkOutAt) throw conflict('Check out of the site first.', 'still_open');
  if (!canExplainLeaving(row.checkOutSource))
    throw conflict('There is nothing to explain for this visit.', 'not_explainable');
  if (row.leaveReason) throw conflict('You already said why.', 'reason_given');
  const [task] = row.taskId
    ? await db
        .select({ status: projectTasks.status })
        .from(projectTasks)
        .where(eq(projectTasks.id, row.taskId))
    : [];
  const [request] = row.serviceRequestId
    ? await db
        .select({ status: serviceRequests.status })
        .from(serviceRequests)
        .where(eq(serviceRequests.id, row.serviceRequestId))
    : [];
  if (
    task?.status === 'completed' ||
    task?.status === 'in_review' ||
    request?.status === 'resolved'
  )
    throw conflict('This job is finished.', 'job_done');
  const now = new Date();
  const [planned] = row.visitId
    ? await db.select().from(visits).where(eq(visits.id, row.visitId))
    : [];
  await db.transaction(async (tx) => {
    // The first answer wins: two at once (a button tapped twice) tell the manager once.
    const [saved] = await tx
      .update(siteVisits)
      .set({ leaveReason: reason, leaveReasonAt: now, updatedAt: now })
      .where(
        and(
          eq(siteVisits.id, visitId),
          eq(siteVisits.userId, actor.userId),
          isNull(siteVisits.leaveReason),
        ),
      )
      .returning({ id: siteVisits.id });
    if (!saved) throw conflict('You already said why.', 'reason_given');
    const words = LEAVE_REASON_WORDS[reason];
    const what = record.taskTitle ?? 'the site';
    if (row.projectId)
      await tx.insert(projectActivities).values({
        projectId: row.projectId,
        taskId: row.taskId,
        kind: 'site_leave_reason',
        message: `${actor.fullName} left the site before ${what} was finished: ${words}.`,
        userId: actor.userId,
        data: { visitId, reason },
      });
    const service = row.serviceRequestId !== null && row.taskId === null;
    await alertVisitOwner(
      tx,
      {
        id: planned?.id ?? row.id,
        kind: planned?.kind ?? (service ? 'service' : 'installation'),
        taskId: row.taskId,
        // A task's alert goes to its project's manager; a request has no one but its crew lead.
        projectId: service ? null : row.projectId,
        leadId: null,
        serviceRequestId: row.serviceRequestId,
        crewUserIds: service
          ? (planned?.crewUserIds ?? []).filter((id) => id !== actor.userId)
          : [],
      },
      {
        kind: 'site_visit_left_unfinished',
        title: `${actor.fullName} left ${record.siteLabel ?? 'the site'} unfinished`,
        body: `${what}${record.projectCode ? ` · ${record.projectCode}` : ''}: ${words}.`,
        key: `site_visit_left:${visitId}`,
      },
    );
    // The alert feed's copy (Duty Day step 5). The manager was just told above: not again.
    await raiseDutyAlert(tx, feedAlert(actor, row, record, reason), { notify: false });
    // "Customer not home" drops the customer's waiting "Was this visit done?"; any other reason sends it.
    await safely(tx, 'Visit check after the reason', (sp) => afterLeaveReason(sp, visitId, reason));
  });
  return oneVisitRecord(db, visitId);
}
