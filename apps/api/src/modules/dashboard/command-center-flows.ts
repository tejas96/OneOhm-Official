import type { CommandCenter } from '@oneohm/api-contracts';
import { type Database, leads, projects, projectTasks, quotations } from '@oneohm/database';
import { addDays, daysBetween } from '@oneohm/shared';
import { and, eq, gte, isNotNull, ne, sql } from 'drizzle-orm';
import { type CenterScope, indiaStart } from './command-center-scope';

/** Systems switched on in the period, and those due to be in the coming week. */
export async function installed(
  db: Database,
  scope: CenterScope,
): Promise<CommandCenter['installed']> {
  const commissioning = and(eq(projectTasks.templateKey, 'testing_commissioning'), scope.filters);
  const done = await db
    .select({ capacityWp: projects.capacityWp, type: projects.type })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(
      and(
        commissioning,
        eq(projectTasks.status, 'completed'),
        gte(projectTasks.completedAt, indiaStart(scope.start)),
      ),
    );
  const due = await db
    .select({ id: projectTasks.id })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(
      and(
        commissioning,
        ne(projectTasks.status, 'completed'),
        sql`${projectTasks.dueDate} <= ${addDays(scope.today, 7)}`,
      ),
    );
  const ofType = (type: string) => done.filter((row) => row.type === type).length;
  return {
    wattsPeak: done.reduce((sum, row) => sum + row.capacityWp, 0),
    commissioned: done.length,
    dueThisWeek: due.length,
    byType: {
      residential: ofType('residential'),
      society: ofType('society'),
      commercial: ofType('commercial'),
    },
  };
}

/** Days tasks on the projects in view have spent waiting, by who they waited on. */
export async function waitingDays(
  db: Database,
  scope: CenterScope,
): Promise<CommandCenter['waitingDays']> {
  const rows = await db
    .select({
      party: projectTasks.waitingParty,
      since: projectTasks.waitingSince,
      status: projectTasks.status,
      completedAt: projectTasks.completedAt,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(and(scope.projects, isNotNull(projectTasks.waitingSince)));
  const days = { internal: 0, customer: 0, bank: 0, discom: 0 };
  for (const row of rows) {
    if (!row.since) continue;
    const end =
      row.status === 'completed' && row.completedAt
        ? row.completedAt.toISOString().slice(0, 10)
        : scope.today;
    days[row.party] += Math.max(0, daysBetween(row.since.toISOString().slice(0, 10), end));
  }
  return days;
}

/** Sales in the period: new leads, how far they got, quotations sent and accepted. */
export async function pipeline(
  db: Database,
  scope: CenterScope,
): Promise<CommandCenter['pipeline']> {
  const since = indiaStart(scope.start);
  const [leadRows, sent, accepted] = await Promise.all([
    db.select({ stage: leads.stage }).from(leads).where(gte(leads.createdAt, since)),
    db.select({ id: quotations.id }).from(quotations).where(gte(quotations.sentAt, since)),
    db.select({ id: quotations.id }).from(quotations).where(gte(quotations.acceptedAt, since)),
  ]);
  return {
    leads: leadRows.length,
    surveys: leadRows.filter((row) => ['survey_scheduled', 'quoted', 'won'].includes(row.stage))
      .length,
    quotations: sent.length,
    accepted: accepted.length,
  };
}
