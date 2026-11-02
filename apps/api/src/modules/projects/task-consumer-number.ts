import { type DatabaseExecutor, projects } from '@oneohm/database';
import { consumerNumberProblem, normalizeConsumerNumber } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { type Actor, can } from '../../common/auth/actor';
import { invalid } from '../../common/http/errors';
import { assertConsumerNumberFree } from '../crm/site-rules';

/**
 * The consumer number a task reads off the bill follows the site's rules (PRD 3.2): the
 * bill's shape, and no other site may have it. Returns the facts with it normalized.
 */
export async function checkedConsumerNumber(
  db: DatabaseExecutor,
  actor: Actor,
  projectId: string,
  facts: Record<string, string>,
): Promise<Record<string, string>> {
  const typed = facts.consumer_number?.trim();
  if (!typed) return facts;
  const number = normalizeConsumerNumber(typed);
  const problem = consumerNumberProblem(number);
  if (problem) throw invalid(problem, { consumer_number: problem });
  const [project] = await db
    .select({ propertyId: projects.propertyId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  await assertConsumerNumberFree(db, number, {
    exceptPropertyId: project?.propertyId,
    field: 'consumer_number',
    reveal: actor.kind === 'staff' && can(actor, 'customers.view'),
  });
  return { ...facts, consumer_number: number };
}
