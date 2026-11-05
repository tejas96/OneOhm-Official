import { customerActions, type DatabaseExecutor, projectFacts } from '@oneohm/database';
import { and, eq, sql } from 'drizzle-orm';

/**
 * What the customer said about a released subsidy, for the Project update line: `received` once they
 * confirmed it reached their bank, `checking` while they say it has not (we are looking into it).
 * Null when they have said nothing, so the line stays "released" from the step's status.
 */
export async function subsidyNote(
  db: DatabaseExecutor,
  projectId: string,
): Promise<'received' | 'checking' | null> {
  const [received] = await db
    .select({ key: projectFacts.key })
    .from(projectFacts)
    .where(and(eq(projectFacts.projectId, projectId), eq(projectFacts.key, 'subsidy_received')));
  if (received) return 'received';
  const [waiting] = await db
    .select({ id: customerActions.id })
    .from(customerActions)
    .where(
      and(
        eq(customerActions.projectId, projectId),
        eq(customerActions.type, 'confirm'),
        eq(customerActions.status, 'open'),
        sql`${customerActions.payload}->>'kind' = 'subsidy_credit'`,
        sql`${customerActions.payload}->>'answer' = 'not_yet'`,
      ),
    )
    .limit(1);
  return waiting ? 'checking' : null;
}
