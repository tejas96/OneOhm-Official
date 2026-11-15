import type { LeftVisit } from '@oneohm/api-contracts';
import { type DatabaseExecutor, projectTasks, serviceRequests, siteVisits } from '@oneohm/database';
import { canExplainLeaving } from '@oneohm/domain';
import { and, desc, eq, gte, isNotNull } from 'drizzle-orm';

const RECENT_MS = 12 * 3_600_000;

/**
 * The person's latest visit that ended in the last 12 hours on a task or a service request,
 * and whether that work is done: the phone asks "Job not finished, why?" only when it is not.
 */
export async function leftVisitOf(
  db: DatabaseExecutor,
  userId: string,
  subject: { readonly taskId: string } | { readonly serviceRequestId: string },
  now: Date = new Date(),
): Promise<LeftVisit | null> {
  const [visit] = await db
    .select({
      id: siteVisits.id,
      leaveReason: siteVisits.leaveReason,
      closedBy: siteVisits.checkOutSource,
    })
    .from(siteVisits)
    .where(
      and(
        eq(siteVisits.userId, userId),
        'taskId' in subject
          ? eq(siteVisits.taskId, subject.taskId)
          : eq(siteVisits.serviceRequestId, subject.serviceRequestId),
        isNotNull(siteVisits.checkOutAt),
        gte(siteVisits.checkOutAt, new Date(now.getTime() - RECENT_MS)),
      ),
    )
    .orderBy(desc(siteVisits.checkOutAt))
    .limit(1);
  if (!visit) return null;
  const [work] =
    'taskId' in subject
      ? await db
          .select({ status: projectTasks.status })
          .from(projectTasks)
          .where(eq(projectTasks.id, subject.taskId))
      : await db
          .select({ status: serviceRequests.status })
          .from(serviceRequests)
          .where(eq(serviceRequests.id, subject.serviceRequestId));
  // Nothing to explain when the work is finished or handed in, or when it was not the person
  // or their phone that ended the visit (a manager's close, the end of their day).
  const done =
    work?.status === 'completed' ||
    work?.status === 'in_review' ||
    work?.status === 'resolved' ||
    !canExplainLeaving(visit.closedBy);
  return { visitId: visit.id, done, reasonGiven: visit.leaveReason !== null };
}
