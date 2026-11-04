import { type DatabaseExecutor, skills, userSkills } from '@oneohm/database';
import { and, eq, inArray } from 'drizzle-orm';
import { invalid } from '../../common/http/errors';

/** Each person's skill keys (PRD 3.7). */
export async function skillsOf(
  db: DatabaseExecutor,
  userIds: readonly string[],
): Promise<ReadonlyMap<string, string[]>> {
  const map = new Map<string, string[]>();
  if (userIds.length === 0) return map;
  const rows = await db
    .select({ userId: userSkills.userId, key: userSkills.skillKey })
    .from(userSkills)
    .where(inArray(userSkills.userId, [...userIds]));
  for (const row of rows) map.set(row.userId, [...(map.get(row.userId) ?? []), row.key]);
  return map;
}

/**
 * The skills a person may not be given: anything not active, unless they already have it.
 * Switching a skill off stops it being given out, but people who hold it keep it.
 */
export function skillsNotAllowed(
  wanted: readonly string[],
  active: ReadonlySet<string>,
  held: ReadonlySet<string>,
): string[] {
  return wanted.filter((key) => !active.has(key) && !held.has(key));
}

/** Replaces a person's skills; a new one must be active, ones already held may stay. */
export async function setSkills(
  tx: DatabaseExecutor,
  userId: string,
  keys: readonly string[],
): Promise<void> {
  const wanted = [...new Set(keys)];
  if (wanted.length > 0) {
    const active = await tx
      .select({ key: skills.key })
      .from(skills)
      .where(and(inArray(skills.key, wanted), eq(skills.active, true)));
    const held = await tx
      .select({ key: userSkills.skillKey })
      .from(userSkills)
      .where(eq(userSkills.userId, userId));
    const blocked = skillsNotAllowed(
      wanted,
      new Set(active.map((row) => row.key)),
      new Set(held.map((row) => row.key)),
    );
    if (blocked.length > 0) {
      throw invalid('Pick skills from the list.', { skills: 'Unknown or switched-off skill.' });
    }
  }
  await tx.delete(userSkills).where(eq(userSkills.userId, userId));
  if (wanted.length > 0) {
    await tx.insert(userSkills).values(wanted.map((skillKey) => ({ userId, skillKey })));
  }
}
