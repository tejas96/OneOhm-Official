import type { ProjectSummary } from '@oneohm/api-contracts';
import { type DatabaseExecutor, discoms, projects, properties, users } from '@oneohm/database';
import {
  deliveryForecast,
  EPC_STAGES,
  type EpcStage,
  type ProjectBlock,
  projectState,
} from '@oneohm/domain';
import { daysBetween, todayIn } from '@oneohm/shared';
import { desc, eq, type SQL } from 'drizzle-orm';
import { type MilestoneRow, summaryFacts, type TaskRow } from './project-summary-facts';

const PAYMENT_GRACE_DAYS = 7;

/** Project cards: stage, progress, who it waits on, what is next, and how worried to be. */
export async function projectSummaries(
  db: DatabaseExecutor,
  where?: SQL,
): Promise<ProjectSummary[]> {
  const query = db
    .select({
      project: {
        id: projects.id,
        code: projects.code,
        name: projects.name,
        type: projects.type,
        capacityWp: projects.capacityWp,
        status: projects.status,
        currentStage: projects.currentStage,
        managerUserId: projects.managerUserId,
        financiallyClosedAt: projects.financiallyClosedAt,
      },
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
  const today = todayIn();
  const { tasks, milestones, blocked } = await summaryFacts(db, ids, today);
  return rows.map(({ project, city, discom, managerName }) =>
    summarise({
      project,
      city,
      discom,
      managerName,
      tasks: tasks.filter((task) => task.projectId === project.id),
      milestones: milestones.filter((milestone) => milestone.projectId === project.id),
      blockedBy: blocked.get(project.id) ?? null,
      today,
    }),
  );
}

const isoDate = (instant: Date) => todayIn('Asia/Kolkata', instant);

type ProjectRow = Pick<
  typeof projects.$inferSelect,
  | 'id'
  | 'code'
  | 'name'
  | 'type'
  | 'capacityWp'
  | 'status'
  | 'currentStage'
  | 'managerUserId'
  | 'financiallyClosedAt'
>;

function summarise(input: {
  readonly project: ProjectRow;
  readonly city: string;
  readonly discom: string;
  readonly managerName: string | null;
  readonly tasks: readonly TaskRow[];
  readonly milestones: readonly MilestoneRow[];
  readonly blockedBy: ProjectBlock | null;
  readonly today: string;
}): ProjectSummary {
  const { project, tasks, milestones, today } = input;
  const open = tasks.filter((task) => task.status !== 'completed');
  const stagesWithTasks = new Set(tasks.map((task) => task.stage));
  const currentStage: EpcStage =
    EPC_STAGES.find((stage) => open.some((task) => task.stage === stage)) ?? project.currentStage;
  const inStage = tasks.filter((task) => task.stage === currentStage);
  const stageProgress = inStage.length
    ? inStage.filter((task) => task.status === 'completed').length / inStage.length
    : 1;
  const overdue = open.filter((task) => task.dueDate < today);
  const longest = open
    .filter((task) => task.status === 'waiting' && task.waitingSince)
    .sort(
      (left, right) => (left.waitingSince?.getTime() ?? 0) - (right.waitingSince?.getTime() ?? 0),
    )[0];
  const waitingDays = longest?.waitingSince
    ? Math.max(0, daysBetween(isoDate(longest.waitingSince), today))
    : 0;
  const nextTask = [...open].sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];
  const money = moneyFacts(milestones, today);
  const latePayment = money.latePayment;
  const state = projectState({
    status: project.status,
    financiallyClosed: project.financiallyClosedAt !== null,
    unpaidBy: money.unpaidBy,
    paymentDue: money.paymentDue,
    paymentLate: Boolean(latePayment),
    blockedBy: input.blockedBy,
    waitingOn: longest?.waitingParty ?? null,
    overdueTasks: overdue.length,
    nextDueSoonNotStarted: Boolean(
      nextTask && daysBetween(today, nextTask.dueDate) <= 1 && nextTask.status !== 'in_progress',
    ),
  });

  return {
    id: project.id,
    code: project.code,
    name: project.name,
    place: input.city,
    type: project.type,
    capacityWp: project.capacityWp,
    discom: input.discom,
    status: project.status,
    currentStage,
    stageProgress,
    skippedStages: EPC_STAGES.filter((stage) => !stagesWithTasks.has(stage)),
    tone: state.tone,
    toneLabel: state.label,
    waitingOn: longest?.waitingParty ?? null,
    waitingDays,
    next: latePayment
      ? { label: latePayment.label, date: latePayment.dueAt ? isoDate(latePayment.dueAt) : today }
      : nextTask
        ? { label: nextTask.title, date: nextTask.dueDate }
        : null,
    openTasks: open.length,
    overdueTasks: overdue.length,
    tasksDone: tasks.length - open.length,
    tasksTotal: tasks.length,
    manager:
      project.managerUserId && input.managerName
        ? { id: project.managerUserId, fullName: input.managerName }
        : null,
    blockedBy: state.tone === 'blocked' ? (input.blockedBy?.detail ?? null) : null,
    forecast: deliveryForecast(open, today),
    completedOn: project.status === 'completed' ? finishedOn(tasks) : null,
  };
}

/** Who still owes money, whether a milestone is due, and the first one past the grace days. */
function moneyFacts(milestones: readonly MilestoneRow[], today: string) {
  const dueNow = milestones.filter(
    (milestone) => milestone.status === 'due' || milestone.status === 'partly_paid',
  );
  const unpaid = milestones.filter((milestone) => milestone.status !== 'paid');
  const customerOwes = unpaid.some((milestone) => milestone.payer === 'customer');
  return {
    paymentDue: dueNow.length > 0,
    latePayment: dueNow.find(
      (milestone) =>
        milestone.dueAt && daysBetween(isoDate(milestone.dueAt), today) > PAYMENT_GRACE_DAYS,
    ),
    unpaidBy: customerOwes ? ('customer' as const) : unpaid.length > 0 ? ('bank' as const) : null,
  };
}

/** The India date the last task finished, or null when none has. */
function finishedOn(tasks: readonly TaskRow[]): string | null {
  const latest = tasks.reduce<Date | null>(
    (last, task) =>
      task.completedAt && (!last || task.completedAt > last) ? task.completedAt : last,
    null,
  );
  return latest ? isoDate(latest) : null;
}
