import { and, eq, isNull } from 'drizzle-orm';
import { answererFor } from './chat-answerer';
import type { DatabaseExecutor } from './client';
import { roleCapabilities, roles, userRoles, users } from './schema/identity.schema';

/** Each person here, or whoever covers for them today, leaving out `except`. */
async function atWork(
  db: DatabaseExecutor,
  ids: readonly string[],
  except: string | null,
): Promise<string[]> {
  const covering = await Promise.all(ids.map((id) => answererFor(db, id)));
  return [...new Set(covering.filter((id): id is string => Boolean(id) && id !== except))];
}

/**
 * The people an alert for a whole duty goes to (live review B6, B8). The Super Admin's
 * all-powers role is the desk: it hears only when nobody else holds the duty. Someone
 * away today is covered by the backup on their leave (one at work today). The person who
 * caused the alert (`exceptUserId`) is left out before that choice, so when they are the
 * only other holder the desk still hears. When nobody at all is at work, every holder
 * but them still hears, so the alert never goes silent.
 */
export async function dutyAlertTargets(
  db: DatabaseExecutor,
  capability: string,
  options: { readonly staffOnly?: boolean; readonly exceptUserId?: string | null | undefined } = {},
): Promise<string[]> {
  const except = options.exceptUserId ?? null;
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
  const holders = [...new Set(rows.map((row) => row.id))].filter((id) => id !== except);
  // Desk only when every role that gives them this duty is the all-powers one.
  const desk = holders.filter((id) => rows.every((row) => row.id !== id || row.system));
  const others = holders.filter((id) => !desk.includes(id));
  for (const group of [others, desk]) {
    const present = await atWork(db, group, except);
    if (present.length > 0) return present;
  }
  return holders;
}
