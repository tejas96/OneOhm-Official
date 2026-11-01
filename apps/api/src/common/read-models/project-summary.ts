import type { ProjectSummary } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  discoms,
  paymentMilestones,
  projects,
  projectTasks,
  properties,
  users,
} from '@oneohm/database';
import { EPC_STAGES, type EpcStage, type WaitingParty } from '@oneohm/domain';
import { daysBetween, todayIn } from '@oneohm/shared';
import { desc, eq, inArray, type SQL } from 'drizzle-orm';

const PARTY_LABEL: Readonly<Record<WaitingParty, string>> = {
  discom: 'Waiting on DISCOM',
  bank: 'Waiting on bank',
  customer: 'Waiting on customer',
  internal: 'Waiting on OneOhm team',
};
const PAYMENT_GRACE_DAYS = 7;

type TaskRow = Pick<
  typeof projectTasks.$inferSelect,
  | 'projectId'
  | 'status'
  | 'stage'
  | 'dueDate'
  | 'waitingParty'
  | 'waitingSince'
  | 'title'
  | 'customerVisible'
>;
type MilestoneRow = Pick<
  typeof paymentMilestones.$inferSelect,
  'projectId' | 'status' | 'dueAt' | 'label'
>;

/** Project cards: stage, progress, who it waits on, what is next, and how worried to be. */
export async function projectSummaries(
  db: DatabaseExecutor,
  where?: SQL,
): Promise<ProjectSummary[]> {
  const query = db
    .select({
      project: projects,
      city: properties.city,
      discom: discoms.code,
      managerName: users.fullName,
    })
    .from(projects)
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .innerJoin(discoms, eq(discoms.id, projects.discomId))
    .leftJoin(users, eq(users.id, projects.managerUserId))
    .orderBy(desc(projects.createdAt));
  const rows = where ? await query.where(where) : await query;
  const ids = rows.map((row) => row.project.id);
  if (ids.length === 0) return [];
  const tasks: TaskRow[] = await db
    .select({
      projectId: projectTasks.projectId,
      status: projectTasks.status,
      stage: projectTasks.stage,
      dueDate: projectTasks.dueDate,
      waitingParty: projectTasks.waitingParty,
      waitingSince: projectTasks.waitingSince,
      title: projectTasks.title,
      customerVisible: projectTasks.customerVisible,
    })
    .from(projectTasks)
    .where(inArray(projectTasks.projectId, ids));
  const milestones: MilestoneRow[] = await db
    .select({
      projectId: paymentMilestones.projectId,
      status: paymentMilestones.status,
      dueAt: paymentMilestones.dueAt,
      label: paymentMilestones.label,
    })
    .from(paymentMilestones)
    .where(inArray(paymentMilestones.projectId, ids));
  const today = todayIn();
  return rows.map(({ project, city, discom, managerName }) =>
    summarise(
      project,
      city,
      discom,
      managerName,
      tasks.filter((task) => task.projectId === project.id),
      milestones.filter((milestone) => milestone.projectId === project.id),
      today,
    ),
  );
}

function summarise(
  project: typeof projects.$inferSelect,
  city: string,
  discom: string,
  managerName: string | null,
  tasks: readonly TaskRow[],
  milestones: readonly MilestoneRow[],
  today: string,
): ProjectSummary {
  const open = tasks.filter((task) => task.status !== 'completed');
  const stagesWithTasks = new Set(tasks.map((task) => task.stage));
  const currentStage: EpcStage =
    EPC_STAGES.find((stage) => open.some((task) => task.stage === stage)) ?? project.currentStage;
  const inStage = tasks.filter((task) => task.stage === currentStage);
  const stageProgress = inStage.length
    ? inStage.filter((task) => task.status === 'completed').length / inStage.length
    : 1;
  const overdue = open.filter((task) => task.dueDate < today);
  const waitingTasks = open
    .filter((task) => task.status === 'waiting' && task.waitingSince)
    .sort(
      (left, right) => (left.waitingSince?.getTime() ?? 0) - (right.waitingSince?.getTime() ?? 0),
    );
  const longest = waitingTasks[0];
  const waitingDays = longest?.waitingSince
    ? Math.max(0, daysBetween(longest.waitingSince.toISOString().slice(0, 10), today))
    : 0;
  const nextTask = [...open].sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];
  const latePayment = milestones.find(
    (milestone) =>
      milestone.status !== 'paid' &&
      milestone.dueAt &&
      daysBetween(milestone.dueAt.toISOString().slice(0, 10), today) > PAYMENT_GRACE_DAYS,
  );

  const [tone, toneLabel] = projectTone({
    status: project.status,
    latePayment: Boolean(latePayment),
    longest,
    overdue: overdue.length,
    nextTask,
    today,
  });

  return {
    id: project.id,
    code: project.code,
    name: project.name,
    place: city,
    type: project.type,
    capacityWp: project.capacityWp,
    discom,
    status: project.status,
    currentStage,
    stageProgress,
    skippedStages: EPC_STAGES.filter((stage) => !stagesWithTasks.has(stage)),
    tone,
    toneLabel,
    waitingOn: longest?.waitingParty ?? null,
    waitingDays,
    next: latePayment
      ? { label: latePayment.label, date: latePayment.dueAt?.toISOString().slice(0, 10) ?? today }
      : nextTask
        ? { label: nextTask.title, date: nextTask.dueDate }
        : null,
    openTasks: open.length,
    overdueTasks: overdue.length,
    tasksDone: tasks.length - open.length,
    tasksTotal: tasks.length,
    manager:
      project.managerUserId && managerName
        ? { id: project.managerUserId, fullName: managerName }
        : null,
  };
}

/** The one word on a project card: the most urgent thing about it, or that it is fine. */
function projectTone(facts: {
  readonly status: (typeof projects.$inferSelect)['status'];
  readonly latePayment: boolean;
  readonly longest: TaskRow | undefined;
  readonly overdue: number;
  readonly nextTask: TaskRow | undefined;
  readonly today: string;
}): [ProjectSummary['tone'], string] {
  const { status, longest, nextTask } = facts;
  if (status === 'completed') return ['done', 'Completed'];
  if (facts.latePayment) return ['overdue', 'Payment overdue'];
  if (longest && longest.waitingParty !== 'internal')
    return ['waiting', PARTY_LABEL[longest.waitingParty]];
  if (facts.overdue > 0)
    return ['overdue', facts.overdue === 1 ? '1 task overdue' : `${facts.overdue} tasks overdue`];
  if (
    nextTask &&
    daysBetween(facts.today, nextTask.dueDate) <= 1 &&
    nextTask.status !== 'in_progress'
  )
    return ['atRisk', 'At risk'];
  if (status === 'operational') return ['onTrack', 'Operational'];
  return ['onTrack', 'On track'];
}
