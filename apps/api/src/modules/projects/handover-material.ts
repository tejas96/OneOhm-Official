import {
  type Database,
  projectActivities,
  type projectTasks,
  type Transaction,
} from '@oneohm/database';
import { describeUnaccounted, overrideReasonProblem, unaccountedMaterial } from '@oneohm/domain';
import { recordAudit } from '../../common/audit';
import { type Actor, can } from '../../common/auth/actor';
import { conflict, forbidden, invalid } from '../../common/http/errors';
import { projectCustody } from '../inventory/custody-reconcile';

type TaskRow = typeof projectTasks.$inferSelect;

/** The library's handover task (PRD 3.17); the key stays when an owner renames it. */
const HANDOVER_KEYS: ReadonlySet<string> = new Set(['handover']);

export interface HandoverOverride {
  readonly reason: string;
  readonly lines: string;
}

/**
 * Final material reconciliation before handover (PRD 3.17): nothing may still be with a
 * contractor. Otherwise the handover waits, with the lines named, unless a manager hands
 * over anyway with a reason (recorded by `recordHandoverOverride`).
 */
export async function checkHandoverMaterial(
  db: Database,
  task: TaskRow,
  actor: Actor,
  override: string | null | undefined,
): Promise<HandoverOverride | null> {
  if (!task.templateKey || !HANDOVER_KEYS.has(task.templateKey)) return null;
  const custody = await projectCustody(db, task.projectId);
  const open = unaccountedMaterial(custody.rows);
  if (open.length === 0) return null;
  const lines = describeUnaccounted(open);
  if (!override?.trim())
    throw conflict(
      `Material is still with the contractor (${lines}). Record what was used or returned on the Material tab first; a manager can hand over anyway with a reason.`,
      'material_unaccounted',
    );
  if (!can(actor, 'projects.manage'))
    throw forbidden('Only a manager can hand over before the material is reconciled.');
  const problem = overrideReasonProblem(override);
  if (problem) throw invalid(problem, { materialOverride: problem });
  // The history and the audit trail keep every line, not the short list.
  return { reason: override.trim(), lines: describeUnaccounted(open, open.length) };
}

/** The manager's decision, in the project history and the audit trail. */
export async function recordHandoverOverride(
  tx: Transaction,
  task: TaskRow,
  userId: string,
  override: HandoverOverride,
): Promise<void> {
  await tx.insert(projectActivities).values({
    projectId: task.projectId,
    taskId: task.id,
    kind: 'material',
    message: `Handed over before the material was reconciled (${override.lines}). Reason: ${override.reason}`,
    userId,
  });
  await recordAudit(tx, userId, 'handover.material_override', 'task', task.id, {
    projectId: task.projectId,
    unaccounted: override.lines,
    reason: override.reason,
  });
}
