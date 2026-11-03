import {
  contractorMembers,
  type DatabaseExecutor,
  projectContractors,
  projectTasks,
  roles,
  type Transaction,
  userRoles,
  users,
} from '@oneohm/database';
import { and, eq, inArray, ne, or } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { invalid } from '../../common/http/errors';
import { syncWorkOrders } from '../contractors/work-order-sync';
import { tellAssignee } from './task-notices';

export interface HandOverMove {
  readonly fromUserId: string;
  readonly toUserId: string | null;
}

const openHeldBy = (projectId: string, userId: string) =>
  and(
    eq(projectTasks.projectId, projectId),
    ne(projectTasks.status, 'completed'),
    or(eq(projectTasks.assigneeUserId, userId), eq(projectTasks.proposedUserId, userId)),
  );

const pickOne = () =>
  invalid('Choose who takes their open tasks.', {
    handOver: 'Pick an active person who stays on the project.',
  });

/**
 * Checked before anything is saved: every removed person who still holds open tasks has
 * a choice, every choice is about a removed person, and each person picked is active
 * staff (or crew of the project's contractor) who is not themselves being removed.
 */
export async function checkHandOver(
  db: DatabaseExecutor,
  projectId: string,
  removed: readonly string[],
  moves: readonly HandOverMove[] = [],
): Promise<void> {
  if (moves.some((move) => !removed.includes(move.fromUserId))) throw pickOne();
  for (const userId of removed) {
    if (moves.some((move) => move.fromUserId === userId)) continue;
    const [open] = await db
      .select({ id: projectTasks.id })
      .from(projectTasks)
      .where(openHeldBy(projectId, userId))
      .limit(1);
    if (open) throw pickOne();
  }
  const targets = [...new Set(moves.flatMap((move) => (move.toUserId ? [move.toUserId] : [])))];
  if (targets.length === 0) return;
  if (targets.some((id) => removed.includes(id))) throw pickOne();
  const [company] = await db
    .select({ id: projectContractors.contractorId })
    .from(projectContractors)
    .where(eq(projectContractors.projectId, projectId));
  const found = await db
    .selectDistinct({ id: users.id, crew: contractorMembers.contractorId })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.kind, 'staff')))
    .leftJoin(contractorMembers, eq(contractorMembers.userId, users.id))
    .where(and(inArray(users.id, targets), eq(users.status, 'active')));
  const fits = (person: (typeof found)[number]) =>
    person.crew === null || person.crew === company?.id;
  if (new Set(found.filter(fits).map((person) => person.id)).size !== targets.length)
    throw pickOne();
}

/**
 * Moves each removed person's open tasks (and proposals) in this project to the chosen
 * person; `toUserId: null` keeps them where they are. Returns how many tasks moved.
 * Run `checkHandOver` first.
 */
export async function handOverTasks(
  tx: Transaction,
  actor: Actor,
  projectId: string,
  moves: readonly HandOverMove[],
): Promise<number> {
  let moved = 0;
  for (const { fromUserId, toUserId } of moves) {
    if (!toUserId) continue;
    const tasks = await tx.select().from(projectTasks).where(openHeldBy(projectId, fromUserId));
    for (const task of tasks) {
      await tx
        .update(projectTasks)
        .set({
          ...(task.assigneeUserId === fromUserId ? { assigneeUserId: toUserId } : {}),
          ...(task.proposedUserId === fromUserId ? { proposedUserId: toUserId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(projectTasks.id, task.id));
      await recordAudit(tx, actor.userId, 'task.assigned', 'task', task.id, {
        userId: toUserId,
        reason: 'team_change',
      });
      // A proposal is only told once a manager confirms it, so only a real assignment notifies.
      if (task.assigneeUserId === fromUserId) await tellAssignee(tx, task, toUserId, actor.userId);
      moved += 1;
    }
  }
  if (moved > 0) await syncWorkOrders(tx, projectId, actor.userId);
  return moved;
}
