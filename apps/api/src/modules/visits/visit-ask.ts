import type { SendRequest } from '@oneohm/api-contracts';
import { projectTasks } from '@oneohm/database';
import { isPresenceKind, visitKindOfTask } from '@oneohm/domain';
import { and, eq, ne } from 'drizzle-orm';
import { conflict, invalid } from '../../common/http/errors';
import type { Composed } from '../send-to-customer/send-compose';
import type { SendContext } from '../send-to-customer/send-context';
import { callerName, type Deps } from '../send-to-customer/send-papers';
import { freeDaysFor } from './visit-capacity';
import { pickList } from './visit-messages';
import { targetOf, type VisitTarget } from './visit-reads';
import { workWords } from './visit-words';

type AskVisit = Extract<SendRequest, { action: 'ask_visit' }>;

/** One key for the target of an ask, so the same thing is not asked twice at once. */
export const targetKey = (
  target: Pick<VisitTarget, 'taskId' | 'serviceRequestId' | 'leadId' | 'kind'>,
) => `${target.kind}:${target.taskId ?? target.serviceRequestId ?? target.leadId}`;

/**
 * Asks the customer to pick a day: the list of days the crew is free, with "Talk to …". Refused
 * for a DISCOM date (the team tells those), for work the customer is not messaged about (PRD
 * 6.2) and for another customer's task.
 */
export async function askVisitCompose(
  deps: Deps,
  ctx: SendContext,
  request: AskVisit,
  id: string,
): Promise<Composed> {
  const target = await targetOf(deps.db, request);
  if (target.customerId !== ctx.customerId) throw invalid('That visit is not for this customer.');
  if (isPresenceKind(target.kind))
    throw invalid('The DISCOM chooses this day: tell the customer the date instead.');
  if (!target.mayMessage)
    throw invalid('This step is not set to message customers (Settings → Task templates).');
  const days = await freeDaysFor(deps.db, target.crew, 9);
  if (days.length === 0)
    throw conflict('The person who comes has no free day in the next 45 days.', 'no_free_day');
  const name = await callerName(deps.db, ctx);
  return {
    built: pickList({
      actionId: id,
      kind: target.kind,
      home: target.home,
      days,
      name,
      customer: ctx.customerName,
    }),
    record: {
      kind: 'action',
      id,
      type: 'visit_pick',
      title: `Pick a day: ${workWords(target.kind)} — ${target.home}`,
      propertyId: target.propertyId,
      projectId: target.projectId,
      taskId: target.taskId,
      payload: {
        target: targetKey(target),
        visitKind: target.kind,
        ...(target.serviceRequestId ? { serviceRequestId: target.serviceRequestId } : {}),
        ...(target.leadId ? { leadId: target.leadId } : {}),
      },
      log: `Asked the customer to pick a day for the ${workWords(target.kind)} (WhatsApp)`,
    },
  };
}

/** The visits this place can ask the customer to pick: one offer per task, lead or request. */
export async function visitAskRequests(db: Deps['db'], ctx: SendContext): Promise<AskVisit[]> {
  if (ctx.serviceRequestId)
    return [{ action: 'ask_visit', serviceRequestId: ctx.serviceRequestId }];
  if (ctx.taskId) return [{ action: 'ask_visit', taskId: ctx.taskId }];
  if (ctx.projectId) {
    const tasks = await db
      .select({
        id: projectTasks.id,
        key: projectTasks.templateKey,
        notify: projectTasks.notifyCustomer,
      })
      .from(projectTasks)
      .where(and(eq(projectTasks.projectId, ctx.projectId), ne(projectTasks.status, 'completed')))
      .orderBy(projectTasks.position);
    return tasks.flatMap((task) => {
      const kind = visitKindOfTask(task.key);
      return kind && !isPresenceKind(kind) && task.notify
        ? [{ action: 'ask_visit' as const, taskId: task.id }]
        : [];
    });
  }
  if (ctx.leadId) return [{ action: 'ask_visit', leadId: ctx.leadId }];
  return [];
}
