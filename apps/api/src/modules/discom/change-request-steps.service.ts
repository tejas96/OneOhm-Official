import { Inject, Injectable } from '@nestjs/common';
import type { ChangeRequestDetail } from '@oneohm/api-contracts';
import { changeRequestSteps, changeRequests, type Transaction } from '@oneohm/database';
import { factLabel, type WaitingParty } from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, can } from '../../common/auth/actor';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { applyChangeRequest } from './change-request-apply';
import { presentChangeRequest } from './change-request-read';

type StepRow = typeof changeRequestSteps.$inferSelect;

/** Working a change request's DISCOM steps: the same start, wait and complete as tasks. */
@Injectable()
export class ChangeRequestStepsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async start(actor: Actor, id: string, stepId: string): Promise<ChangeRequestDetail> {
    const step = await this.load(actor, id, stepId);
    if (step.status === 'pending') throw conflict('Finish the earlier steps first.', 'blocked');
    await this.db
      .update(changeRequestSteps)
      .set({
        status: 'in_progress',
        startedAt: step.startedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(changeRequestSteps.id, stepId));
    return presentChangeRequest(this.db, id);
  }

  async wait(
    actor: Actor,
    id: string,
    stepId: string,
    input: {
      party: WaitingParty;
      referenceNumber?: string | null | undefined;
      nextFollowUpOn?: string | null | undefined;
      note?: string | null | undefined;
    },
  ): Promise<ChangeRequestDetail> {
    const step = await this.load(actor, id, stepId);
    if (step.status === 'pending') throw conflict('Finish the earlier steps first.', 'blocked');
    await this.db.transaction(async (tx) => {
      await tx
        .update(changeRequestSteps)
        .set({
          status: 'waiting',
          waitingParty: input.party,
          waitingSince:
            step.status === 'waiting' && step.waitingParty === input.party
              ? step.waitingSince
              : new Date(),
          ...(input.nextFollowUpOn !== undefined ? { nextFollowUpOn: input.nextFollowUpOn } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          updatedAt: new Date(),
        })
        .where(eq(changeRequestSteps.id, stepId));
      if (input.referenceNumber !== undefined) {
        await tx
          .update(changeRequests)
          .set({ referenceNumber: input.referenceNumber, updatedAt: new Date() })
          .where(eq(changeRequests.id, id));
      }
    });
    return presentChangeRequest(this.db, id);
  }

  /** Records what the step captures; the last step applies the change to the property. */
  async complete(
    actor: Actor,
    id: string,
    stepId: string,
    facts: Record<string, string>,
    note: string | null | undefined,
  ): Promise<ChangeRequestDetail> {
    const step = await this.load(actor, id, stepId);
    if (step.status === 'pending') throw conflict('Finish the earlier steps first.', 'blocked');
    const [request] = await this.db.select().from(changeRequests).where(eq(changeRequests.id, id));
    if (!request) throw notFound('That change request');
    const captured = { ...request.captured };
    for (const [key, value] of Object.entries(facts))
      if (value.trim()) captured[key] = value.trim();
    const missing = step.captures.filter((key) => !captured[key]);
    if (missing.length > 0) {
      throw invalid(
        'Add the details this step records before completing it.',
        Object.fromEntries(missing.map((key) => [key, `${factLabel(key)} is required.`])),
      );
    }
    await this.db.transaction(async (tx) => {
      const now = new Date();
      await tx
        .update(changeRequestSteps)
        .set({
          status: 'completed',
          completedAt: now,
          completedByUserId: actor.userId,
          ...(note ? { note } : {}),
          updatedAt: now,
        })
        .where(eq(changeRequestSteps.id, stepId));
      await tx
        .update(changeRequests)
        .set({
          captured,
          ...(captured.application_number && !request.referenceNumber
            ? { referenceNumber: captured.application_number }
            : {}),
          updatedAt: now,
        })
        .where(eq(changeRequests.id, id));
      const next = await this.nextStep(tx, id);
      if (next) {
        await tx
          .update(changeRequestSteps)
          .set({ status: 'ready', updatedAt: now })
          .where(eq(changeRequestSteps.id, next.id));
      } else {
        await applyChangeRequest(tx, { ...request, captured }, actor.userId);
      }
      await recordAudit(tx, actor.userId, 'change_request.step_completed', 'change_request', id, {
        step: step.key,
      });
    });
    return presentChangeRequest(this.db, id);
  }

  private async nextStep(tx: Transaction, id: string): Promise<StepRow | undefined> {
    const steps = await tx
      .select()
      .from(changeRequestSteps)
      .where(eq(changeRequestSteps.changeRequestId, id));
    return steps
      .filter((candidate) => candidate.status === 'pending')
      .sort((left, right) => left.position - right.position)[0];
  }

  private async load(actor: Actor, id: string, stepId: string): Promise<StepRow> {
    const [row] = await this.db
      .select({ step: changeRequestSteps, status: changeRequests.status })
      .from(changeRequestSteps)
      .innerJoin(changeRequests, eq(changeRequests.id, changeRequestSteps.changeRequestId))
      .where(and(eq(changeRequestSteps.id, stepId), eq(changeRequestSteps.changeRequestId, id)));
    if (!row) throw notFound('That step');
    if (row.status !== 'open') throw conflict('This change request is closed.', 'closed');
    if (row.step.status === 'completed') throw conflict('This step is already done.', 'done');
    if (row.step.assigneeUserId !== actor.userId && !can(actor, 'discom.manage'))
      throw forbidden('Only the assignee or the DISCOM coordinator can update this step.');
    return row.step;
  }
}
