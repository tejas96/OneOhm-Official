import {
  changeRequestSteps,
  changeRequests,
  projectActivities,
  readBusinessSetting,
  type Transaction,
} from '@oneohm/database';
import { type AssigneeCandidate, type ChangeRequestStep, pickAssignee } from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { queueWhatsApp } from '../../common/outbox';
import {
  type ChangeRequestTypeRow,
  typeAt,
} from '../../common/read-models/change-request-type-store';

export interface RaiseInput {
  /** The type as its DISCOM defines it (Settings → DISCOMs). */
  readonly definition: ChangeRequestTypeRow;
  readonly customer: { readonly id: string; readonly name: string; readonly phoneE164: string };
  readonly propertyId: string;
  readonly projectId: string | null;
  /** Already checked against the type's fields. */
  readonly values: Readonly<Record<string, string>>;
  readonly note: string | null;
}

/**
 * Writes a change request and its DISCOM steps, each assigned by the normal rules
 * (PRD 3.15, step 3), inside the caller's transaction, and tells the customer.
 */
export async function raiseChangeRequest(
  tx: Transaction,
  userId: string,
  input: RaiseInput,
  candidates: readonly AssigneeCandidate[],
): Promise<{ id: string; number: string }> {
  const definition = input.definition;
  const today = todayIn();
  const year = today.slice(0, 4);
  // Serialised, so two requests raised together never get the same number.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('oneohm:change_request'))`);
  const [count] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(changeRequests)
    .where(like(changeRequests.number, `CR-${year}-%`));
  const number = `CR-${year}-${String((count?.count ?? 0) + 1).padStart(4, '0')}`;
  const [request] = await tx
    .insert(changeRequests)
    .values({
      number,
      type: definition.key,
      typeId: definition.id,
      customerId: input.customer.id,
      propertyId: input.propertyId,
      projectId: input.projectId,
      discomId: definition.discomId,
      values: { ...input.values },
      note: input.note,
      createdByUserId: userId,
    })
    .returning({ id: changeRequests.id });
  if (!request) throw new Error('Change request insert returned nothing.');
  await writeSteps(tx, request.id, definition.steps, today, candidates);
  if (input.projectId) {
    await tx.insert(projectActivities).values({
      projectId: input.projectId,
      kind: 'change_request',
      message: `${definition.title} ${number} raised.`,
      userId,
    });
  }
  // Routed WhatsApp, then SMS, then in person: opted-out customers still hear.
  await queueWhatsApp(
    tx,
    input.customer.phoneE164,
    'change_request_raised',
    { customer: input.customer.name, request: definition.title, number },
    `change_request_raised:${request.id}`,
  );
  await recordAudit(tx, userId, 'change_request.created', 'change_request', request.id, {
    type: definition.key,
    values: input.values,
    projectId: input.projectId,
  });
  return { id: request.id, number };
}

/**
 * A project set up with a consumer name change (PRD 3.15, 3.16) runs it as one track:
 * the DISCOM name-change request, linked to the project, holds net metering and the
 * subsidy until done. An open name request already on the site is linked, not repeated.
 */
export async function raiseProjectNameChange(
  tx: Transaction,
  userId: string,
  input: Omit<RaiseInput, 'definition' | 'values' | 'note'> & {
    readonly projectCode: string;
    readonly discomId: string;
  },
  candidates: readonly AssigneeCandidate[],
): Promise<{ id: string; number: string }> {
  const [open] = await tx
    .select({ id: changeRequests.id, number: changeRequests.number })
    .from(changeRequests)
    .where(
      and(
        eq(changeRequests.propertyId, input.propertyId),
        eq(changeRequests.status, 'open'),
        inArray(changeRequests.type, ['consumer_name_change', 'name_spelling_correction']),
      ),
    )
    .limit(1);
  if (open) {
    await tx
      .update(changeRequests)
      .set({ projectId: input.projectId, updatedAt: new Date() })
      .where(eq(changeRequests.id, open.id));
    if (input.projectId) {
      await tx.insert(projectActivities).values({
        projectId: input.projectId,
        kind: 'change_request',
        message: `Linked to the open name change request ${open.number}.`,
        userId,
      });
    }
    return open;
  }
  // The name change as the project's DISCOM runs it; raised even if switched off for
  // new requests, since the project itself asked for it.
  const definition = await typeAt(tx, input.discomId, 'consumer_name_change');
  return raiseChangeRequest(
    tx,
    userId,
    {
      ...input,
      definition,
      values: { newName: input.customer.name },
      note: `Raised with project ${input.projectCode}.`,
    },
    candidates,
  );
}

/**
 * The request's DISCOM steps, one after another from today, each given to a person by
 * the company's assignment rules (Settings → Assignment: least busy or take turns, skip
 * leave), counting each step as it is handed out so work spreads like project tasks.
 */
async function writeSteps(
  tx: Transaction,
  requestId: string,
  steps: readonly ChangeRequestStep[],
  today: string,
  candidates: readonly AssigneeCandidate[],
): Promise<void> {
  const rules = await readBusinessSetting(tx, 'assignment');
  let people = [...candidates];
  let due = today;
  for (const [position, step] of steps.entries()) {
    const starts = due;
    due = addDays(due, step.durationDays);
    const assignee = pickAssignee(people, step.roleKey, { from: starts, to: due }, null, rules);
    if (assignee) {
      const given = new Date(Date.now() + position).toISOString();
      people = people.map((person) =>
        person.userId === assignee.userId
          ? { ...person, openTasks: person.openTasks + 1, lastAssignedAt: given }
          : person,
      );
    }
    await tx.insert(changeRequestSteps).values({
      changeRequestId: requestId,
      key: step.key,
      title: step.title,
      roleKey: step.roleKey,
      assigneeUserId: assignee?.userId ?? null,
      status: position === 0 ? 'ready' : 'pending',
      waitingParty: step.waitingParty,
      captures: [...step.captures],
      dueDate: due,
      position,
    });
  }
}
