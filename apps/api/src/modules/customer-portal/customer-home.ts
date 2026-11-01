import type { CustomerProject } from '@oneohm/api-contracts';
import {
  customerFeedback,
  type Database,
  paymentMilestones,
  payments,
  projects,
  projectTasks,
  properties,
  quotations,
  users,
} from '@oneohm/database';
import { EPC_STAGES } from '@oneohm/domain';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';

const day = (value: Date) => value.toISOString().slice(0, 10);

type TaskRow = {
  projectId: string;
  title: string;
  stage: (typeof EPC_STAGES)[number];
  templateKey: string;
  status: string;
  customerVisible: boolean;
  dueDate: string;
  completedAt: Date | null;
};

/** Stage states from the project's tasks: stages without tasks were skipped. */
function journey(tasks: readonly TaskRow[]): Pick<CustomerProject, 'stages' | 'currentStage'> {
  const open = tasks.filter((task) => task.status !== 'completed');
  const current =
    EPC_STAGES.find((stage) => open.some((task) => task.stage === stage)) ?? 'subsidy';
  const currentIndex = EPC_STAGES.indexOf(current);
  const stages = EPC_STAGES.map((stage, index) => {
    if (!tasks.some((task) => task.stage === stage)) return { stage, state: 'skipped' as const };
    if (open.length === 0 || index < currentIndex) return { stage, state: 'done' as const };
    return { stage, state: index === currentIndex ? ('current' as const) : ('upcoming' as const) };
  });
  return { stages, currentStage: current };
}

function subsidyStatus(enabled: boolean, tasks: readonly TaskRow[]) {
  if (!enabled) return 'not_applicable' as const;
  const done = (key: string) =>
    tasks.some((task) => task.templateKey === key && task.status === 'completed');
  if (done('subsidy_release')) return 'released' as const;
  if (done('subsidy_application')) return 'applied' as const;
  return 'pending' as const;
}

/** Every home of one customer, told the way the customer needs it. */
export async function customerProjects(
  db: Database,
  customerId: string,
): Promise<CustomerProject[]> {
  const rows = await db
    .select({
      id: projects.id,
      code: projects.code,
      capacityWp: projects.capacityWp,
      type: projects.type,
      status: projects.status,
      subsidy: projects.subsidy,
      place: properties.city,
      quotationId: quotations.id,
      quotationNumber: quotations.number,
      subsidyPaise: quotations.subsidyPaise,
      managerName: users.fullName,
      managerPhone: users.phoneE164,
    })
    .from(projects)
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .innerJoin(quotations, eq(quotations.id, projects.quotationId))
    .leftJoin(users, eq(users.id, projects.managerUserId))
    .where(and(eq(projects.customerId, customerId), ne(projects.status, 'cancelled')))
    .orderBy(asc(projects.createdAt));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const tasks: TaskRow[] = await db
    .select({
      projectId: projectTasks.projectId,
      title: projectTasks.title,
      stage: projectTasks.stage,
      templateKey: projectTasks.templateKey,
      status: projectTasks.status,
      customerVisible: projectTasks.customerVisible,
      dueDate: projectTasks.dueDate,
      completedAt: projectTasks.completedAt,
    })
    .from(projectTasks)
    .where(inArray(projectTasks.projectId, ids));
  const milestones = await db
    .select()
    .from(paymentMilestones)
    .where(inArray(paymentMilestones.projectId, ids))
    .orderBy(asc(paymentMilestones.position));
  const paid = await db
    .select({ milestoneId: payments.milestoneId, amount: payments.amountPaise })
    .from(payments)
    .where(inArray(payments.projectId, ids));
  const feedback = await db
    .select({ projectId: customerFeedback.projectId })
    .from(customerFeedback)
    .where(inArray(customerFeedback.projectId, ids));

  return rows.map((row) => {
    const own = tasks.filter((task) => task.projectId === row.id);
    const visible = own.filter((task) => task.customerVisible);
    const next = visible
      .filter((task) => task.status !== 'completed')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    const lines = milestones
      .filter((milestone) => milestone.projectId === row.id)
      .map((milestone) => ({
        label: milestone.label,
        payer: milestone.payer,
        amountPaise: milestone.amountPaise,
        paidPaise: paid
          .filter((payment) => payment.milestoneId === milestone.id)
          .reduce((sum, payment) => sum + payment.amount, 0),
        status: milestone.status,
        dueAt: milestone.dueAt?.toISOString() ?? null,
      }));
    return {
      id: row.id,
      code: row.code,
      capacityWp: row.capacityWp,
      type: row.type,
      place: row.place,
      status: row.status,
      ...journey(own),
      updates: visible
        .filter((task) => task.completedAt)
        .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0))
        .map((task) => ({ title: task.title, done: true, date: day(task.completedAt as Date) })),
      nextStep: next ? { title: next.title, date: next.dueDate } : null,
      payments: {
        totalPaise: lines.reduce((sum, line) => sum + line.amountPaise, 0),
        paidPaise: lines.reduce((sum, line) => sum + line.paidPaise, 0),
        milestones: lines,
      },
      subsidy: {
        amountPaise: row.subsidy ? row.subsidyPaise : 0,
        status: subsidyStatus(row.subsidy, own),
      },
      quotation: { id: row.quotationId, number: row.quotationNumber },
      contact: row.managerName ? { name: row.managerName, phone: row.managerPhone } : null,
      feedbackGiven: feedback.some((entry) => entry.projectId === row.id),
    };
  });
}
