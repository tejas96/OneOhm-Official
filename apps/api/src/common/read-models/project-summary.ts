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
import {
  type MilestoneRow,
  type StageCount,
  summaryFacts,
  type TaskRow,
} from './project-summary-facts';

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
  // The same projects, for the fact queries to ask by subquery when there are many.
  const scope = db
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .innerJoin(discoms, eq(discoms.id, projects.discomId))
    .leftJoin(users, eq(users.id, projects.managerUserId))
    .where(where);
  const { tasks, stages, milestones, blocked } = await summaryFacts(db, ids, today, scope);
  const open = byProject(tasks);
  const counts = byProject(stages);
  const money = byProject(milestones);
  return rows.map(({ project, city, discom, managerName }) =>
    summarise({
      project,
      city,
      discom,
      managerName,
      open: open.get(project.id) ?? [],
      stages: counts.get(project.id) ?? [],
      milestones: money.get(project.id) ?? [],
      blockedBy: blocked.get(project.id) ?? null,
      today,
    }),
  );
}

/** Rows grouped by their project, read once rather than filtered per card. */
function byProject<T extends { readonly projectId: string }>(rows: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const list = grouped.get(row.projectId);
    if (list) list.push(row);
    else grouped.set(row.projectId, [row]);
  }
  return grouped;
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
  /** The project's open tasks only; finished work arrives as `stages` counts. */
  readonly open: readonly TaskRow[];
  readonly stages: readonly StageCount[];
  readonly milestones: readonly MilestoneRow[];
  readonly blockedBy: ProjectBlock | null;
  readonly today: string;
}): ProjectSummary {
  const { project, open, stages, milestones, today } = input;
  const stagesWithTasks = new Set(stages.map((count) => count.stage));
  const currentStage: EpcStage =
    EPC_STAGES.find((stage) => open.some((task) => task.stage === stage)) ?? project.currentStage;
  const inStage = stages.find((count) => count.stage === currentStage);
  const stageProgress = inStage?.total ? inStage.done / inStage.total : 1;
  const tasksTotal = stages.reduce((sum, count) => sum + count.total, 0);
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
    tasksDone: tasksTotal - open.length,
    tasksTotal,
    manager:
      project.managerUserId && input.managerName
        ? { id: project.managerUserId, fullName: input.managerName }
        : null,
    blockedBy: state.tone === 'blocked' ? (input.blockedBy?.detail ?? null) : null,
    forecast: deliveryForecast(open, today),
    completedOn: project.status === 'completed' ? finishedOn(stages) : null,
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
function finishedOn(stages: readonly StageCount[]): string | null {
  const latest = stages.reduce<Date | null>(
    (last, count) =>
      count.lastDoneAt && (!last || count.lastDoneAt > last) ? count.lastDoneAt : last,
    null,
  );
  return latest ? isoDate(latest) : null;
}
