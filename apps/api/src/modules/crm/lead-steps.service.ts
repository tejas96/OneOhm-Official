import { Inject, Injectable } from '@nestjs/common';
import type { LeadStepRecord } from '@oneohm/api-contracts';
import { leadSteps, leads } from '@oneohm/database';
import { effectiveStep, newStepKey, type OpenLeadStage, orderSteps } from '@oneohm/domain';
import { eq, notInArray } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { loadLeadSteps } from './lead-steps-read';

/** The owner's sales pipeline (PRD 3.3, 7.4), edited in Settings → Lead stages. */
@Injectable()
export class LeadStepsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<LeadStepRecord[]> {
    const steps = await loadLeadSteps(this.db);
    const open = await this.db
      .select({ stage: leads.stage, stepKey: leads.stepKey })
      .from(leads)
      .where(notInArray(leads.stage, ['won', 'lost']));
    const counts = new Map<string, number>();
    for (const lead of open) {
      const step = effectiveStep(steps, lead.stage, lead.stepKey);
      if (step) counts.set(step.key, (counts.get(step.key) ?? 0) + 1);
    }
    return orderSteps(steps).map((step) => ({ ...step, leads: counts.get(step.key) ?? 0 }));
  }

  async create(
    actor: Actor,
    input: { name: string; stage: OpenLeadStage },
  ): Promise<LeadStepRecord[]> {
    assertCan(actor, 'settings.manage');
    const steps = await loadLeadSteps(this.db);
    const name = input.name.trim();
    if (steps.some((step) => step.name.trim().toLowerCase() === name.toLowerCase())) {
      throw conflict('A step with this name already exists.', 'exists');
    }
    // The key is made once and never follows a rename, so it must not clash with any step.
    const key = newStepKey(
      name,
      steps.map((step) => step.key),
    );
    const inStage = steps.filter((step) => step.stage === input.stage);
    const inserted = await this.db
      .insert(leadSteps)
      .values({
        key,
        name,
        stage: input.stage,
        position: Math.max(-1, ...inStage.map((step) => step.position)) + 1,
      })
      .onConflictDoNothing()
      .returning({ key: leadSteps.key });
    if (inserted.length === 0) throw conflict('That step was just added. Try again.', 'exists');
    await recordAudit(this.db, actor.userId, 'lead_step.created', 'lead_step', key, input);
    return this.list();
  }

  async update(
    actor: Actor,
    key: string,
    patch: {
      name?: string | undefined;
      active?: boolean | undefined;
      move?: 'up' | 'down' | undefined;
    },
  ): Promise<LeadStepRecord[]> {
    assertCan(actor, 'settings.manage');
    const steps = orderSteps(await loadLeadSteps(this.db));
    const step = steps.find((candidate) => candidate.key === key);
    if (!step) throw notFound('That step');
    const renamed = patch.name?.trim().toLowerCase();
    if (renamed && steps.some((s) => s.key !== key && s.name.trim().toLowerCase() === renamed)) {
      throw conflict('A step with this name already exists.', 'exists');
    }
    if (
      patch.active === false &&
      steps.filter((s) => s.stage === step.stage && s.active).length === 1
    ) {
      throw conflict('Each stage needs at least one step that is on.', 'last_step');
    }
    await this.db.transaction(async (tx) => {
      if (patch.name !== undefined || patch.active !== undefined) {
        await tx
          .update(leadSteps)
          .set({
            ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
            ...(patch.active !== undefined ? { active: patch.active } : {}),
            updatedAt: new Date(),
          })
          .where(eq(leadSteps.key, key));
      }
      if (patch.move) {
        const siblings = steps.filter((candidate) => candidate.stage === step.stage);
        const at = siblings.findIndex((candidate) => candidate.key === key);
        const other = siblings[patch.move === 'up' ? at - 1 : at + 1];
        if (other) {
          await tx
            .update(leadSteps)
            .set({ position: other.position })
            .where(eq(leadSteps.key, key));
          await tx
            .update(leadSteps)
            .set({ position: step.position })
            .where(eq(leadSteps.key, other.key));
        }
      }
      await recordAudit(tx, actor.userId, 'lead_step.updated', 'lead_step', key, patch);
    });
    return this.list();
  }
}
