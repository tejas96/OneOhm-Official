import type { ProjectPage, ProjectPageQuery } from '@oneohm/api-contracts';
import { type DatabaseExecutor, projects, users } from '@oneohm/database';
import { filterProjectList, type ProjectStatusFilter } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, inArray, type SQL } from 'drizzle-orm';
import { slicePage } from '../../common/paging';
import { projectSummaries } from '../../common/read-models/project-summary';

const STATUSES: Readonly<Record<ProjectStatusFilter, readonly string[] | null>> = {
  live: ['active', 'operational'],
  completed: ['completed'],
  cancelled: ['cancelled'],
  all: null,
};

/** What the database can narrow before the cards are worked out: status, type, manager. */
function candidates(query: ProjectPageQuery): SQL | undefined {
  const statuses = STATUSES[query.status];
  return and(
    statuses
      ? inArray(projects.status, statuses as (typeof projects.status.enumValues)[number][])
      : undefined,
    query.type === 'all' ? undefined : eq(projects.type, query.type),
    query.manager ? eq(projects.managerUserId, query.manager) : undefined,
  );
}

/**
 * One page of project cards. Health, expected finish and the "due" order come from each
 * project's open work, so the cards of the matching projects are worked out (from open
 * tasks and counts only) and then cut into the page.
 */
export async function projectPage(
  db: DatabaseExecutor,
  query: ProjectPageQuery,
): Promise<ProjectPage> {
  const cards = await projectSummaries(db, candidates(query));
  const matching = filterProjectList(
    cards,
    {
      search: query.q ?? '',
      status: query.status,
      health: query.health,
      type: query.type,
      sort: query.sort,
      manager: query.manager ?? '',
      finish: query.finish,
      since: query.since ?? '',
    },
    todayIn(),
  );
  return {
    ...slicePage(matching, query),
    capacityWp: matching.reduce((sum, project) => sum + project.capacityWp, 0),
    managerName: query.manager ? await managerName(db, query.manager) : null,
  };
}

async function managerName(db: DatabaseExecutor, id: string): Promise<string | null> {
  const [row] = await db
    .select({ name: users.fullName })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return row?.name ?? null;
}
