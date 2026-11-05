import { customerActions, type DatabaseExecutor, projects } from '@oneohm/database';
import { and, eq, sql } from 'drizzle-orm';
import { contextFor, type SendContext } from '../send-to-customer/send-context';
import type { JourneyTask } from './journey-store';

/** The customer's context for a project task, as the system acting on its own (no staff member). */
export async function contextOfTask(
  db: DatabaseExecutor,
  task: JourneyTask,
): Promise<SendContext | null> {
  const [project] = await db
    .select({ customerId: projects.customerId, code: projects.code })
    .from(projects)
    .where(eq(projects.id, task.projectId));
  if (!project) return null;
  return contextFor(db, {
    customerId: project.customerId,
    projectId: task.projectId,
    projectCode: project.code,
    leadId: null,
    taskId: task.id,
    serviceRequestId: null,
  });
}

/** Whether this question was asked before (answered or not): each is asked once per step. */
export async function askedBefore(db: DatabaseExecutor, target: string): Promise<boolean> {
  const [row] = await db
    .select({ id: customerActions.id })
    .from(customerActions)
    .where(
      and(
        eq(customerActions.type, 'confirm'),
        sql`${customerActions.payload}->>'target' = ${target}`,
      ),
    )
    .limit(1);
  return Boolean(row);
}
