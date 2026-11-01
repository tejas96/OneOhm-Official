import type { ProjectTask } from '@oneohm/api-contracts';
import { type DatabaseExecutor, projects, projectTasks, users } from '@oneohm/database';
import { BUDGET_HOLD_REASON, budgetHold, SURVEY_FACT_KEYS } from '@oneohm/domain';
import { and, arrayOverlaps, inArray } from 'drizzle-orm';

type TaskRow = Pick<
  typeof projectTasks.$inferSelect,
  'id' | 'projectId' | 'stage' | 'status' | 'proposedUserId' | 'outsideTeam'
>;

export interface AssignmentState {
  readonly proposedAssignee: ProjectTask['proposedAssignee'];
  readonly outsideTeam: boolean;
  /** Why buying or dispatch waits on the budget (PRD 3.5, Flow F); null when it does not. */
  readonly budgetBlock: string | null;
}

/** Projects whose budget is not locked yet, and whether each has a survey task. */
async function budgets(db: DatabaseExecutor, projectIds: readonly string[]) {
  if (projectIds.length === 0) return new Map<string, { status: string; hasSurvey: boolean }>();
  const rows = await db
    .select({ id: projects.id, status: projects.budgetStatus })
    .from(projects)
    .where(inArray(projects.id, [...projectIds]));
  const surveyed = await db
    .selectDistinct({ projectId: projectTasks.projectId })
    .from(projectTasks)
    .where(
      and(
        arrayOverlaps(projectTasks.captures, [...SURVEY_FACT_KEYS]),
        inArray(projectTasks.projectId, [...projectIds]),
      ),
    );
  const withSurvey = new Set(surveyed.map((row) => row.projectId));
  return new Map(
    rows.map((row) => [row.id, { status: row.status, hasSurvey: withSurvey.has(row.id) }]),
  );
}

/**
 * Who a critical task is proposed to, whether it went outside the named team, and
 * whether the budget holds it (PRD 3.5, 3.8), for a page of tasks at once.
 */
export async function assignmentStates(
  db: DatabaseExecutor,
  tasks: readonly TaskRow[],
): Promise<Map<string, AssignmentState>> {
  const proposedIds = [
    ...new Set(tasks.flatMap((task) => (task.proposedUserId ? [task.proposedUserId] : []))),
  ];
  const names = proposedIds.length
    ? await db
        .select({ id: users.id, fullName: users.fullName })
        .from(users)
        .where(inArray(users.id, proposedIds))
    : [];
  const projectBudgets = await budgets(db, [
    ...new Set(tasks.filter((task) => task.stage === 'material').map((task) => task.projectId)),
  ]);
  return new Map(
    tasks.map((task) => {
      const proposed = names.find((person) => person.id === task.proposedUserId) ?? null;
      const budget = projectBudgets.get(task.projectId);
      const hold =
        budget && task.status !== 'completed'
          ? budgetHold(task.stage, budget.status, budget.hasSurvey)
          : null;
      return [
        task.id,
        {
          proposedAssignee: proposed,
          outsideTeam: task.outsideTeam,
          budgetBlock: hold ? BUDGET_HOLD_REASON[hold] : null,
        },
      ];
    }),
  );
}
