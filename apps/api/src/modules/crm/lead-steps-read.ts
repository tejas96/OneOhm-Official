import { type DatabaseExecutor, leadSteps } from '@oneohm/database';
import { isOpenLeadStage, type LeadStage, type LeadStep } from '@oneohm/domain';
import { asc } from 'drizzle-orm';
import { invalid } from '../../common/http/errors';
import { STAGE_LABEL } from './lead-labels';

/** Every pipeline step, as the domain rules expect them (PRD 3.3). */
export async function loadLeadSteps(db: DatabaseExecutor): Promise<LeadStep[]> {
  const rows = await db.select().from(leadSteps).orderBy(asc(leadSteps.position));
  return rows
    .filter((row) => isOpenLeadStage(row.stage))
    .map((row) => ({
      key: row.key,
      name: row.name,
      stage: row.stage as LeadStep['stage'],
      position: row.position,
      active: row.active,
    }));
}

/** The active step a person picked, or a clear error. */
export async function pickStep(db: DatabaseExecutor, key: string): Promise<LeadStep> {
  const step = (await loadLeadSteps(db)).find((candidate) => candidate.key === key);
  if (!step?.active) {
    throw invalid('Pick a step from the list.', { stepKey: 'Unknown or switched-off step.' });
  }
  return step;
}

/** A step sets its stage; a bare stage change starts at that stage's first step. */
export function stepColumns(step: LeadStep | null, stage: LeadStage | undefined) {
  if (step) return { stage: step.stage, stepKey: step.key };
  return stage ? { stepKey: null } : {};
}

/** The timeline line for a move, or null when nothing moved. */
export function movedNote(
  current: {
    readonly stage: LeadStage;
    readonly step: { readonly key: string; readonly name: string } | null;
  },
  step: LeadStep | null,
  stage: LeadStage | undefined,
): string | null {
  const from = current.step?.name ?? STAGE_LABEL[current.stage];
  if (step) return step.key === current.step?.key ? null : `Moved from ${from} to ${step.name}.`;
  if (stage && stage !== current.stage) return `Moved from ${from} to ${STAGE_LABEL[stage]}.`;
  return null;
}
