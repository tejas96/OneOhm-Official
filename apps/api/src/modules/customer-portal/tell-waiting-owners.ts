import { type DatabaseExecutor, notify, projectTasks } from '@oneohm/database';
import { and, eq, isNotNull } from 'drizzle-orm';

/**
 * Tells the owners of the project's tasks that wait on the customer that a paper came
 * (papers per home, flow 3): one alert per request and person; those `except` hear already
 * (the asker) or filed it themselves.
 */
export async function tellWaitingOwners(
  tx: DatabaseExecutor,
  projectId: string,
  paper: { title: string; dedupeKey: string; except: readonly (string | null)[] },
): Promise<void> {
  const owners = await tx
    .selectDistinct({ userId: projectTasks.assigneeUserId })
    .from(projectTasks)
    .where(
      and(
        eq(projectTasks.projectId, projectId),
        eq(projectTasks.status, 'waiting'),
        eq(projectTasks.waitingParty, 'customer'),
        isNotNull(projectTasks.waitingSince),
        isNotNull(projectTasks.assigneeUserId),
      ),
    );
  for (const { userId } of owners) {
    if (!userId || paper.except.includes(userId)) continue;
    await notify(
      tx,
      { userId },
      {
        kind: 'document_received',
        title: paper.title,
        body: 'It is filed in the project documents. Your task was waiting on the customer.',
        subject: { type: 'project', id: projectId, projectId },
        dedupeKey: `${paper.dedupeKey}:${userId}`,
      },
    );
  }
}
