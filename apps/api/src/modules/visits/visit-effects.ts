import {
  customerActions,
  type DatabaseExecutor,
  leads,
  projectActivities,
  projectTasks,
  serviceRequests,
  type visits,
} from '@oneohm/database';
import { and, eq, inArray } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { logLead } from '../crm/lead-history';

export type VisitRow = typeof visits.$inferSelect;

/** One line where the team reads it (project log, lead timeline) and one audit row. */
export async function logVisit(
  tx: DatabaseExecutor,
  visit: Pick<VisitRow, 'id' | 'projectId' | 'leadId' | 'taskId' | 'serviceRequestId'>,
  userId: string | null,
  audit: string,
  message: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  if (visit.projectId)
    await tx.insert(projectActivities).values({
      projectId: visit.projectId,
      taskId: visit.taskId,
      kind: 'visit',
      message,
      userId,
      data: { visitId: visit.id, ...data },
    });
  else if (visit.leadId) await logLead(tx, visit.leadId, userId, 'visit', message, true);
  await recordAudit(tx, userId, audit, 'visit', visit.id, {
    ...data,
    ...(visit.serviceRequestId ? { serviceRequestId: visit.serviceRequestId } : {}),
  });
}

/** The task's planned dates follow the confirmed visit: it starts that day and is not due before it. */
export async function followTaskDates(tx: DatabaseExecutor, taskId: string, day: string) {
  const [task] = await tx
    .select({ due: projectTasks.dueDate, status: projectTasks.status })
    .from(projectTasks)
    .where(eq(projectTasks.id, taskId));
  if (!task || task.status === 'completed') return;
  await tx
    .update(projectTasks)
    .set({
      startDate: day,
      dueDate: task.due < day ? day : task.due,
      updatedAt: new Date(),
    })
    .where(eq(projectTasks.id, taskId));
}

/** The service request's own visit day mirrors the open visit, so no screen shows two dates. */
export async function mirrorServiceDay(
  tx: DatabaseExecutor,
  serviceRequestId: string,
  day: string | null,
) {
  await tx
    .update(serviceRequests)
    .set({ visitOn: day, updatedAt: new Date() })
    .where(eq(serviceRequests.id, serviceRequestId));
}

/** A survey picked or confirmed on a lead: the lead is "Survey scheduled" with that day as its next action. */
export async function surveyOnLead(
  tx: DatabaseExecutor,
  leadId: string,
  userId: string | null,
  day: string,
  slot: 'morning' | 'afternoon',
) {
  const [lead] = await tx.select({ stage: leads.stage }).from(leads).where(eq(leads.id, leadId));
  if (!lead) return;
  const early = lead.stage === 'new' || lead.stage === 'contacted';
  await tx
    .update(leads)
    .set({
      ...(early ? { stage: 'survey_scheduled' as const } : {}),
      nextActionOn: day,
      nextActionTime: slot === 'morning' ? '10:00' : '14:00',
      nextActionNote: `Site survey (${slot})`,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId));
  if (early)
    await logLead(tx, leadId, userId, 'stage_change', 'Moved to Survey scheduled (visit booked).');
}

/** Closes (or cancels) the visit asks of this visit's target that are still waiting. */
export async function settleVisitActions(
  tx: DatabaseExecutor,
  visit: Pick<VisitRow, 'customerId' | 'taskId' | 'serviceRequestId' | 'leadId' | 'kind'>,
  to: 'closed' | 'cancelled',
  types: ('visit_pick' | 'presence')[] = ['visit_pick', 'presence'],
) {
  const target = visit.taskId ? eq(customerActions.taskId, visit.taskId) : undefined;
  const rows = await tx
    .select({ id: customerActions.id, payload: customerActions.payload })
    .from(customerActions)
    .where(
      and(
        eq(customerActions.customerId, visit.customerId),
        inArray(customerActions.type, types),
        inArray(customerActions.status, ['open', 'received']),
        target,
      ),
    );
  const mine = rows.filter((row) =>
    visit.taskId
      ? true
      : visit.serviceRequestId
        ? row.payload.serviceRequestId === visit.serviceRequestId
        : row.payload.leadId === visit.leadId && row.payload.visitKind === visit.kind,
  );
  if (mine.length === 0) return;
  const now = new Date();
  await tx
    .update(customerActions)
    .set(
      to === 'closed'
        ? { status: 'closed', closedAt: now, updatedAt: now }
        : { status: 'cancelled', cancelledAt: now, updatedAt: now },
    )
    .where(
      inArray(
        customerActions.id,
        mine.map((row) => row.id),
      ),
    );
}
