import type { ChangeRequestDetail, ChangeRequestSummary } from '@oneohm/api-contracts';
import {
  changeRequestSteps,
  changeRequests,
  changeRequestTypes,
  customers,
  type DatabaseExecutor,
  discoms,
  projects,
  properties,
  taskTemplates,
  users,
} from '@oneohm/database';
import { defaultChangeRequestType } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { definitionOf } from '../../common/read-models/change-request-type-store';

/** Change requests as list rows, newest first, with the step they are on. */
export async function changeRequestSummaries(
  db: DatabaseExecutor,
  where: SQL | undefined,
): Promise<ChangeRequestSummary[]> {
  const rows = await db
    .select({
      request: changeRequests,
      customerName: customers.name,
      propertyLabel: properties.label,
      propertyCity: properties.city,
      projectCode: projects.code,
      projectName: projects.name,
      discomCode: discoms.code,
      typeTitle: changeRequestTypes.title,
    })
    .from(changeRequests)
    .innerJoin(customers, eq(customers.id, changeRequests.customerId))
    .innerJoin(properties, eq(properties.id, changeRequests.propertyId))
    .leftJoin(projects, eq(projects.id, changeRequests.projectId))
    .leftJoin(discoms, eq(discoms.id, changeRequests.discomId))
    .leftJoin(changeRequestTypes, eq(changeRequestTypes.id, changeRequests.typeId))
    .where(where)
    .orderBy(desc(changeRequests.createdAt));
  const ids = rows.map((row) => row.request.id);
  const steps = ids.length
    ? await db
        .select()
        .from(changeRequestSteps)
        .where(inArray(changeRequestSteps.changeRequestId, ids))
        .orderBy(asc(changeRequestSteps.position))
    : [];
  return rows.map((row) => {
    const mine = steps.filter((step) => step.changeRequestId === row.request.id);
    const current = mine.find((step) => step.status !== 'completed');
    const project =
      row.request.projectId && row.projectCode && row.projectName
        ? { id: row.request.projectId, code: row.projectCode, name: row.projectName }
        : null;
    return {
      id: row.request.id,
      number: row.request.number,
      type: row.request.type,
      title: row.typeTitle ?? defaultChangeRequestType(row.request.type)?.title ?? row.request.type,
      status: row.request.status,
      customer: { id: row.request.customerId, name: row.customerName },
      property: { id: row.request.propertyId, label: row.propertyLabel, city: row.propertyCity },
      project,
      discomCode: row.discomCode,
      referenceNumber: row.request.referenceNumber,
      currentStep:
        current && row.request.status === 'open'
          ? { title: current.title, status: current.status, waitingParty: current.waitingParty }
          : null,
      stepsDone: mine.filter((step) => step.status === 'completed').length,
      stepsTotal: mine.length,
      createdAt: row.request.createdAt.toISOString(),
      completedAt: row.request.completedAt?.toISOString() ?? null,
    };
  });
}

export async function presentChangeRequest(
  db: DatabaseExecutor,
  id: string,
): Promise<ChangeRequestDetail> {
  const [summary] = await changeRequestSummaries(db, eq(changeRequests.id, id));
  const [request] = await db.select().from(changeRequests).where(eq(changeRequests.id, id));
  if (!summary || !request) throw notFound('That change request');
  const steps = await db
    .select({ step: changeRequestSteps, assigneeName: users.fullName })
    .from(changeRequestSteps)
    .leftJoin(users, eq(users.id, changeRequestSteps.assigneeUserId))
    .where(eq(changeRequestSteps.changeRequestId, id))
    .orderBy(asc(changeRequestSteps.position));
  const today = todayIn();
  const definition = await definitionOf(db, request);
  const held = definition.blocks.taskKeys.length
    ? await db
        .select({ key: taskTemplates.key, title: taskTemplates.title })
        .from(taskTemplates)
        .where(inArray(taskTemplates.key, [...definition.blocks.taskKeys]))
    : [];
  return {
    ...summary,
    values: request.values,
    captured: request.captured,
    previousValues: request.previousValues ?? null,
    appliedValues: request.appliedValues ?? null,
    note: request.note,
    cancelledReason: request.cancelledReason,
    blocks: {
      stages: [...definition.blocks.stages],
      taskKeys: [...definition.blocks.taskKeys],
      taskTitles: definition.blocks.taskKeys.map(
        (key) => held.find((task) => task.key === key)?.title ?? key,
      ),
    },
    steps: steps.map(({ step, assigneeName }) => ({
      id: step.id,
      key: step.key,
      title: step.title,
      status: step.status,
      waitingParty: step.waitingParty,
      assignee:
        step.assigneeUserId && assigneeName
          ? { id: step.assigneeUserId, fullName: assigneeName }
          : null,
      dueDate: step.dueDate,
      overdue: step.status !== 'completed' && request.status === 'open' && step.dueDate < today,
      captures: step.captures,
      waitingSince: step.waitingSince?.toISOString() ?? null,
      nextFollowUpOn: step.nextFollowUpOn,
      note: step.note,
      completedAt: step.completedAt?.toISOString() ?? null,
    })),
  };
}
