import { customerActions, type DatabaseExecutor } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import { logAction } from '../documents/customer-action-log';
import { resumeAfterWait, taskFor } from './journey-store';

/**
 * The installation-stage steps that follow dispatch. "Is the roof ready?" stays open until the crew
 * actually begins one of them: staff may dispatch the material long before the customer answers.
 */
export const SITE_READY_CLOSERS: ReadonlySet<string> = new Set([
  'ground_foundation',
  'structure_installation',
  'installation_complete',
]);

type StaleTask = { readonly id: string; readonly projectId: string; readonly templateKey: string };

/** Whether this open ask has no point any more now that `task` started or finished. */
export function isStale(
  task: StaleTask,
  ask: { readonly taskId: string | null; readonly payload: Record<string, unknown> },
  event: 'started' | 'completed',
): boolean {
  const kind = String(ask.payload.kind);
  if (kind === 'site_ready') return SITE_READY_CLOSERS.has(task.templateKey);
  if (event === 'started') return false;
  // The subsidy, bank and layout questions wait for the customer's own answer.
  return (
    kind === 'installation' &&
    (ask.taskId === task.id || task.templateKey === 'testing_commissioning')
  );
}

/**
 * What a step-closed ask keeps: the customer's own answer stays in `customerAnswer`, since `answer`
 * becomes 'step_done' (the late answer is found by it).
 */
export function closedPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const own = typeof payload.answer === 'string' ? { customerAnswer: payload.answer } : {};
  return { ...payload, ...own, answer: 'step_done' };
}

/** A roof question answered "Not yet" kept its step waiting on the customer: closing it ends that wait. */
export function keptStepWaiting(payload: Record<string, unknown>): boolean {
  return payload.kind === 'site_ready' && payload.answer === 'not_yet';
}

async function closeWhere(tx: DatabaseExecutor, task: StaleTask, event: 'started' | 'completed') {
  const open = await tx
    .select()
    .from(customerActions)
    .where(
      and(
        eq(customerActions.projectId, task.projectId),
        eq(customerActions.type, 'confirm'),
        eq(customerActions.status, 'open'),
      ),
    );
  const now = new Date();
  for (const action of open) {
    if (!isStale(task, action, event)) continue;
    await tx
      .update(customerActions)
      .set({
        status: 'closed',
        closedAt: now,
        updatedAt: now,
        payload: closedPayload(action.payload),
      })
      .where(and(eq(customerActions.id, action.id), eq(customerActions.status, 'open')));
    // Dispatch must not wait forever on a question nobody can answer any more.
    if (keptStepWaiting(action.payload) && action.taskId) {
      const waiting = await taskFor(tx, action.taskId);
      if (waiting && waiting.status !== 'completed')
        await resumeAfterWait(tx, waiting, String(action.payload.waitSince ?? '') || null);
    }
    await logAction(tx, action, {
      kind: 'customer_action',
      message: `${action.title}: closed, the step moved on`,
      userId: null,
      data: { customerActionId: action.id },
    });
  }
}

/**
 * A step was completed: the installation question is over once the system is tested and switched on,
 * and the roof question once installation work has begun. They close quietly: no Home line, no alert,
 * no message (the log keeps one line).
 */
export function closeStaleAsks(tx: DatabaseExecutor, task: StaleTask): Promise<void> {
  return closeWhere(tx, task, 'completed');
}

/** A step was started: the roof question closes when the crew begins installation work. */
export function closeAsksOnStart(tx: DatabaseExecutor, task: StaleTask): Promise<void> {
  return closeWhere(tx, task, 'started');
}
