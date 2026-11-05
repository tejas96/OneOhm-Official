import {
  answererFor,
  type DatabaseExecutor,
  holdersOf,
  projects,
  users,
  waConversations,
} from '@oneohm/database';
import { and, asc, eq, inArray } from 'drizzle-orm';

const firstName = (full: string) => full.split(/\s+/)[0] ?? full;

async function nameOf(db: DatabaseExecutor, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const [row] = await db.select({ name: users.fullName }).from(users).where(eq(users.id, userId));
  return row ? firstName(row.name) : null;
}

/** Who answers for the project's customer: the project manager (or their cover today). */
export async function projectPerson(
  db: DatabaseExecutor,
  projectId: string | null,
): Promise<{ id: string | null; name: string | null }> {
  if (!projectId) return { id: null, name: null };
  const [project] = await db
    .select({ manager: projects.managerUserId })
    .from(projects)
    .where(eq(projects.id, projectId));
  const id = await answererFor(db, project?.manager ?? null);
  return { id, name: await nameOf(db, id) };
}

/**
 * The person a customer is told will call: the problem's assignee, else the project manager, else the
 * person on the chat, else the service desk's first person at work (cover). Null leaves "our team".
 */
export async function callerFor(
  db: DatabaseExecutor,
  given: {
    readonly assignee?: string | null;
    readonly projectId?: string | null;
    readonly phone?: string | null;
  },
): Promise<{ id: string | null; name: string | null }> {
  const assignee = await answererFor(db, given.assignee ?? null);
  if (assignee) return { id: assignee, name: await nameOf(db, assignee) };
  const manager = await projectPerson(db, given.projectId ?? null);
  if (manager.id) return manager;
  if (given.phone) {
    const [chat] = await db
      .select({ owner: waConversations.assignedUserId })
      .from(waConversations)
      .where(eq(waConversations.phone, given.phone));
    const owner = await answererFor(db, chat?.owner ?? null);
    if (owner) return { id: owner, name: await nameOf(db, owner) };
  }
  const desk = await holdersOf(db, 'service.manage');
  if (desk.length === 0) return { id: null, name: null };
  const [first] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, desk), eq(users.status, 'active'), eq(users.onLeave, false)))
    .orderBy(asc(users.fullName))
    .limit(1);
  return { id: first?.id ?? null, name: await nameOf(db, first?.id ?? null) };
}
