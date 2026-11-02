import {
  type Database,
  type Notice,
  projects,
  projectTasks,
  taskDependencies,
  taskFreshness,
} from '@oneohm/database';
import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { onLiveProject } from './live-projects';

interface ManagedTask {
  readonly id: string;
  readonly title: string;
  readonly projectId: string;
  readonly code: string;
  readonly managerUserId: string | null;
  readonly assignee: string | null;
}

type TellManager = (db: Database, task: ManagedTask, notice: Notice) => Promise<void>;

const open = ne(projectTasks.status, 'completed');

function openTasks(db: Database, where = open) {
  return db
    .select({
      id: projectTasks.id,
      title: projectTasks.title,
      projectId: projectTasks.projectId,
      status: projectTasks.status,
      assigneeUserId: projectTasks.assigneeUserId,
      updatedAt: projectTasks.updatedAt,
      code: projects.code,
      managerUserId: projects.managerUserId,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(and(where, isNotNull(projectTasks.assigneeUserId), onLiveProject(db)));
}

/**
 * When the person holding up someone else's task is on leave, their manager hears once
 * per leave (spec 3.4), so the work can be handed over.
 */
export async function queueBlockerOnLeave(
  db: Database,
  today: string,
  tellManager: TellManager,
): Promise<number> {
  const holding = await db
    .selectDistinct({ id: taskDependencies.dependsOnTaskId })
    .from(taskDependencies)
    .innerJoin(projectTasks, eq(projectTasks.id, taskDependencies.taskId))
    .where(open);
  if (holding.length === 0) return 0;
  // Only work that could move now: a blocked or pending task is not holding anyone up yet.
  const rows = await openTasks(
    db,
    and(
      inArray(projectTasks.status, ['ready', 'in_progress']),
      inArray(
        projectTasks.id,
        holding.map((row) => row.id),
      ),
    ),
  );
  const fresh = await taskFreshness(db, rows, today);
  let sent = 0;
  for (const row of rows) {
    const state = fresh.get(row.id);
    if (!state?.assigneeLeaveFrom) continue;
    await tellManager(
      db,
      { ...row, assignee: null },
      {
        kind: 'blocker_on_leave',
        title: `Held up by leave on ${row.code}`,
        body: `${row.title} holds up other work, and the person doing it is on leave. Hand it over if it cannot wait.`,
        subject: { type: 'task', id: row.id, projectId: row.projectId },
        dedupeKey: `leave-block:${row.id}:${state.assigneeLeaveFrom}`,
      },
    );
    sent += 1;
  }
  return sent;
}
