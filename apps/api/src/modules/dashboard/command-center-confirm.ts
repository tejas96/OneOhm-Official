import type { ActionItem } from '@oneohm/api-contracts';
import { type Database, projects, projectTasks } from '@oneohm/database';
import { and, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm';

/**
 * Critical tasks with a proposed person waiting for a manager (PRD 3.8): one action that
 * opens those tasks, narrowed to the project when only one project has some.
 */
export async function assignmentConfirmations(db: Database): Promise<ActionItem[]> {
  const rows = await db
    .select({
      taskId: projectTasks.id,
      projectId: projects.id,
      name: projects.name,
      code: projects.code,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(
      and(
        isNotNull(projectTasks.proposedUserId),
        isNull(projectTasks.assigneeUserId),
        ne(projectTasks.status, 'completed'),
        inArray(projects.status, ['active', 'operational']),
      ),
    );
  if (rows.length === 0) return [];
  const projectIds = new Set(rows.map((row) => row.projectId));
  const first = rows[0];
  const one = projectIds.size === 1 && first;
  return [
    {
      id: 'confirm-assignees',
      tone: 'review',
      title:
        rows.length === 1
          ? '1 critical task needs you to confirm who does it'
          : `${rows.length} critical tasks need you to confirm who does them`,
      detail: one ? `${first.code} · ${first.name}` : `Across ${projectIds.size} projects`,
      action: 'Confirm',
      party: 'internal',
      href:
        rows.length === 1 && first
          ? `/projects/${first.projectId}?tab=tasks&task=${first.taskId}`
          : one
            ? `/command-center/tasks?show=confirm&project=${first.projectId}`
            : '/command-center/tasks?show=confirm',
    },
  ];
}
