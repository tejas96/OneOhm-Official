import {
  type DatabaseExecutor,
  homeNameOf,
  paymentMilestones,
  payments,
  projects,
  projectTasks,
  properties,
  taskTemplates,
  users,
} from '@oneohm/database';
import { CUSTOMER_STEP_TITLES } from '@oneohm/domain';
import { and, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { SendContext } from './send-context';

/** A home a location can be asked for, named the way a message names it. */
export interface HomeChoice {
  readonly propertyId: string;
  readonly projectId: string | null;
  readonly home: string;
  readonly located: boolean;
}

/** The homes in reach of this place: the project's or lead's site, else every home of the customer. */
export async function homesOf(db: DatabaseExecutor, ctx: SendContext): Promise<HomeChoice[]> {
  const rows = await db
    .select({
      id: properties.id,
      located: sql<boolean>`${properties.latitude} is not null`,
      projectId: sql<
        string | null
      >`(select p.id from projects p where p.property_id = "properties"."id" and p.status <> 'cancelled' order by p.created_at desc limit 1)`,
      leadId: sql<
        string | null
      >`(select l.id from leads l where l.property_id = "properties"."id" order by l.created_at desc limit 1)`,
    })
    .from(properties)
    .where(eq(properties.customerId, ctx.customerId))
    .orderBy(desc(properties.createdAt));
  const own = ctx.projectId
    ? rows.filter((row) => row.projectId === ctx.projectId)
    : ctx.leadId
      ? rows.filter((row) => row.leadId === ctx.leadId)
      : rows;
  const homes: HomeChoice[] = [];
  for (const row of own)
    homes.push({
      propertyId: row.id,
      projectId: row.projectId,
      located: row.located,
      home: await homeNameOf(db, row.projectId, row.id),
    });
  return homes;
}

/** An instalment the customer still owes, in reach of this place. */
export interface DueInstalment {
  readonly id: string;
  readonly projectId: string;
  readonly label: string;
  readonly leftPaise: number;
  readonly home: string;
}

export async function dueInstalments(
  db: DatabaseExecutor,
  ctx: Pick<SendContext, 'customerId' | 'projectId'>,
): Promise<DueInstalment[]> {
  const rows = await db
    .select({
      id: paymentMilestones.id,
      projectId: paymentMilestones.projectId,
      label: paymentMilestones.label,
      amount: paymentMilestones.amountPaise,
      paid: sql<string>`coalesce((select sum(p.amount_paise) from payments p where p.milestone_id = ${paymentMilestones.id}), 0)`,
    })
    .from(paymentMilestones)
    .innerJoin(projects, eq(projects.id, paymentMilestones.projectId))
    .where(
      and(
        eq(projects.customerId, ctx.customerId),
        ne(projects.status, 'cancelled'),
        ctx.projectId ? eq(projects.id, ctx.projectId) : undefined,
        eq(paymentMilestones.payer, 'customer'),
        inArray(paymentMilestones.status, ['due', 'partly_paid']),
      ),
    )
    .orderBy(paymentMilestones.position);
  const due: DueInstalment[] = [];
  for (const row of rows) {
    const leftPaise = row.amount - Number(row.paid);
    if (leftPaise > 0)
      due.push({
        id: row.id,
        projectId: row.projectId,
        label: row.label,
        leftPaise,
        home: await homeNameOf(db, row.projectId),
      });
  }
  return due;
}

/** A receipt that exists, newest first. */
export interface ReceiptChoice {
  readonly id: string;
  readonly number: string;
  readonly amountPaise: number;
  readonly on: string;
  readonly projectId: string;
  readonly projectCode: string;
  readonly milestone: string;
  readonly milestoneId: string;
}

export async function receiptsOf(db: DatabaseExecutor, ctx: SendContext): Promise<ReceiptChoice[]> {
  const rows = await db
    .select({
      id: payments.id,
      number: payments.receiptNumber,
      amountPaise: payments.amountPaise,
      on: payments.receivedOn,
      projectId: payments.projectId,
      projectCode: projects.code,
      milestone: paymentMilestones.label,
      milestoneId: paymentMilestones.id,
    })
    .from(payments)
    .innerJoin(projects, eq(projects.id, payments.projectId))
    .innerJoin(paymentMilestones, eq(paymentMilestones.id, payments.milestoneId))
    .where(
      and(
        eq(projects.customerId, ctx.customerId),
        ctx.projectId ? eq(projects.id, ctx.projectId) : undefined,
        isNotNull(payments.receiptNumber),
        sql`${payments.amountPaise} > 0`,
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(5);
  return rows.flatMap((row) => (row.number ? [{ ...row, number: row.number }] : []));
}

/** A person from our side who can be named to the customer, with the work they come for. */
export interface CrewChoice {
  readonly userId: string;
  readonly name: string;
  readonly phone: string;
  readonly work: string;
}

/** The project's manager and the people on its tasks (or on the one task), who have a phone. */
export async function crewOf(db: DatabaseExecutor, ctx: SendContext): Promise<CrewChoice[]> {
  if (!ctx.projectId) return [];
  const crew: CrewChoice[] = [];
  const add = (
    row: { userId: string | null; name: string | null; phone: string | null },
    work: string,
  ) => {
    if (!row.userId || !row.name || !row.phone) return;
    if (crew.some((one) => one.userId === row.userId && one.work === work)) return;
    crew.push({ userId: row.userId, name: row.name, phone: row.phone, work });
  };
  const tasks = await db
    .select({
      userId: projectTasks.assigneeUserId,
      name: users.fullName,
      phone: users.phoneE164,
      title: projectTasks.title,
    })
    .from(projectTasks)
    .innerJoin(users, eq(users.id, projectTasks.assigneeUserId))
    .where(
      and(
        eq(projectTasks.projectId, ctx.projectId),
        ne(projectTasks.status, 'completed'),
        ctx.taskId ? eq(projectTasks.id, ctx.taskId) : undefined,
      ),
    )
    .orderBy(projectTasks.position)
    .limit(10);
  for (const task of tasks) add(task, task.title);
  const [manager] = await db
    .select({ userId: users.id, name: users.fullName, phone: users.phoneE164 })
    .from(projects)
    .innerJoin(users, eq(users.id, projects.managerUserId))
    .where(eq(projects.id, ctx.projectId));
  if (manager) add(manager, 'site visit');
  return crew;
}

/** A task that waits, as the delay notice names it. */
export interface WaitingTask {
  readonly id: string;
  /** The customer's English words for the step; null when there are none (the caller says it in their language). */
  readonly stage: string | null;
  readonly templateKey: string;
  readonly party: string;
  /** The task's template lets the customer hear about it (PRD 6.2: only configured tasks message). */
  readonly allowed: boolean;
}

export async function waitingTask(
  db: DatabaseExecutor,
  taskId: string,
): Promise<WaitingTask | null> {
  const [task] = await db
    .select({
      id: projectTasks.id,
      title: projectTasks.title,
      status: projectTasks.status,
      party: projectTasks.waitingParty,
      notify: projectTasks.notifyCustomer,
      customerTitle: taskTemplates.customerTitle,
      templateKey: projectTasks.templateKey,
    })
    .from(projectTasks)
    .leftJoin(taskTemplates, eq(taskTemplates.key, projectTasks.templateKey))
    .where(eq(projectTasks.id, taskId))
    .limit(1);
  if (task?.status !== 'waiting') return null;
  return {
    id: task.id,
    // The customer's words for the step, never the internal task title.
    stage: task.customerTitle?.trim() || CUSTOMER_STEP_TITLES[task.templateKey] || null,
    templateKey: task.templateKey,
    party: task.party,
    allowed: task.notify,
  };
}
