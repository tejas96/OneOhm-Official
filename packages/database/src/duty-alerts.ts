import { and, eq, isNull } from 'drizzle-orm';
import { answererFor } from './chat-answerer';
import type { DatabaseExecutor } from './client';
import { roleCapabilities, roles, userRoles, users } from './schema/identity.schema';

/** Who covers for this person today: their backup while they are away, else themselves. */
export async function whoCovers(db: DatabaseExecutor, userId: string): Promise<string> {
  return (await answererFor(db, userId)) ?? userId;
}

/** Each person here, or whoever covers for them today; nobody when no one is at work. */
async function atWork(db: DatabaseExecutor, ids: readonly string[]): Promise<string[]> {
  const covering = await Promise.all(ids.map((id) => answererFor(db, id)));
  return [...new Set(covering.filter((id): id is string => Boolean(id)))];
}

/**
 * The people an alert for a whole duty goes to (live review B6, B8). The Super Admin's
 * all-powers role is the desk: it hears only when nobody else holds the duty. Someone
 * away today is covered by the backup on their leave; when nobody at all is at work,
 * every holder still hears, so the alert never goes silent.
 */
export async function dutyAlertTargets(
  db: DatabaseExecutor,
  capability: string,
  options: { readonly staffOnly?: boolean } = {},
): Promise<string[]> {
  const rows = await db
    .select({ id: users.id, system: roles.system })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.archivedAt)))
    .innerJoin(roleCapabilities, eq(roleCapabilities.roleId, roles.id))
    .where(
      and(
        eq(users.status, 'active'),
        eq(roleCapabilities.capability, capability),
        options.staffOnly ? eq(roles.kind, 'staff') : undefined,
      ),
    );
  const holders = [...new Set(rows.map((row) => row.id))];
  // Desk only when every role that gives them this duty is the all-powers one.
  const desk = holders.filter((id) => rows.every((row) => row.id !== id || row.system));
  const others = holders.filter((id) => !desk.includes(id));
  for (const group of [others, desk]) {
    const present = await atWork(db, group);
    if (present.length > 0) return present;
  }
  return holders;
}
