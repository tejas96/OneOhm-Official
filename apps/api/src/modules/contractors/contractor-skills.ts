import { type DatabaseExecutor, roles } from '@oneohm/database';
import { and, inArray, isNull, ne } from 'drizzle-orm';
import { invalid } from '../../common/http/errors';

/**
 * A contractor's kinds of work are role keys (the crew's tasks are matched by them); an
 * unknown word would leave every crew task without a person, so it is refused.
 */
export async function assertKnownSkills(
  db: DatabaseExecutor,
  skills: readonly string[] | undefined,
): Promise<void> {
  if (!skills || skills.length === 0) return;
  const found = await db
    .select({ key: roles.key })
    .from(roles)
    .where(
      and(inArray(roles.key, [...skills]), isNull(roles.archivedAt), ne(roles.kind, 'reseller')),
    );
  const known = new Set(found.map((row) => row.key));
  const unknown = skills.filter((skill) => !known.has(skill));
  if (unknown.length > 0)
    throw invalid('Pick the kinds of work from the list.', {
      skills: `Not a kind of work: ${unknown.join(', ')}.`,
    });
}
