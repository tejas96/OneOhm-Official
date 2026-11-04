import { activeUserIds, type DatabaseExecutor, holdersOf, liveOnly, users } from '@oneohm/database';
import { inArray } from 'drizzle-orm';

interface ApprovalTask {
  readonly approval: boolean;
  readonly reviewer: string;
  readonly assigneeUserId: string | null;
}

/**
 * Who can approve each task, by name, for the task panel: the project manager when the
 * task says so, otherwise everyone with approval rights. The person doing it is left
 * out, since nobody approves their own work while someone else can.
 */
export async function approverNamer(
  db: DatabaseExecutor,
  managerIds: readonly (string | null)[],
): Promise<(task: ApprovalTask, managerUserId: string | null) => string[]> {
  const approvers = await holdersOf(db, 'tasks.approve');
  const live = await activeUserIds(db, managerIds);
  const ids = [...new Set([...approvers, ...managerIds.filter((id) => id !== null)])];
  const named = ids.length
    ? await db
        .select({ id: users.id, fullName: users.fullName })
        .from(users)
        .where(inArray(users.id, ids))
    : [];
  const nameOf = new Map(named.map((user) => [user.id, user.fullName]));
  return (task, managerUserId) => {
    if (!task.approval) return [];
    const manager = liveOnly(managerUserId, live);
    const designated = task.reviewer === 'project_manager' && manager ? [manager] : approvers;
    const others = designated.filter((id) => id !== task.assigneeUserId);
    const people =
      others.length > 0 ? others : approvers.filter((id) => id !== task.assigneeUserId);
    return people
      .map((id) => nameOf.get(id))
      .filter((name): name is string => Boolean(name))
      .sort();
  };
}
