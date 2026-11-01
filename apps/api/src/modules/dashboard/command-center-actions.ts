import type { ActionItem } from '@oneohm/api-contracts';
import {
  type Database,
  discoms,
  leads,
  paymentMilestones,
  projects,
  projectTasks,
  quotations,
} from '@oneohm/database';
import { daysBetween, formatInrCompact } from '@oneohm/shared';
import { and, eq, inArray, isNotNull, isNull, lte, ne, notInArray } from 'drizzle-orm';

const PAYMENT_GRACE_DAYS = 7;
const DISCOM_PATIENCE_DAYS = 5;
const MAX_ACTIONS = 6;
const plural = (count: number, one: string, many: string) =>
  count === 1 ? one : many.replace('#', String(count));
const daysSince = (date: Date | null, today: string) =>
  date ? daysBetween(date.toISOString().slice(0, 10), today) : 0;

/** What needs the owner, most urgent first; each item has one next action (PRD 3.1). */
export async function buildActions(db: Database, today: string): Promise<ActionItem[]> {
  const groups = await Promise.all([
    latePayments(db, today),
    longDiscomWaits(db, today),
    pendingDiscounts(db),
    bankClaims(db),
    taskAlerts(db, today),
    leadFollowUps(db, today),
  ]);
  return groups.flat().slice(0, MAX_ACTIONS);
}

async function latePayments(db: Database, today: string): Promise<ActionItem[]> {
  const rows = await db
    .select({
      id: paymentMilestones.id,
      label: paymentMilestones.label,
      amount: paymentMilestones.amountPaise,
      dueAt: paymentMilestones.dueAt,
      projectId: projects.id,
      name: projects.name,
    })
    .from(paymentMilestones)
    .innerJoin(projects, eq(projects.id, paymentMilestones.projectId))
    .where(
      and(
        inArray(paymentMilestones.status, ['due', 'partly_paid']),
        eq(paymentMilestones.payer, 'customer'),
        isNotNull(paymentMilestones.dueAt),
      ),
    );
  return rows
    .map((row) => ({ row, days: daysSince(row.dueAt, today) }))
    .filter(({ days }) => days > PAYMENT_GRACE_DAYS)
    .map(({ row, days }) => ({
      id: `pay-${row.id}`,
      tone: 'overdue' as const,
      title: `${row.label} is ${days} days overdue`,
      detail: `${row.name} · ${formatInrCompact(row.amount)}`,
      action: 'Send reminder',
      party: 'customer' as const,
      href: `/projects/${row.projectId}`,
    }));
}

async function longDiscomWaits(db: Database, today: string): Promise<ActionItem[]> {
  const rows = await db
    .select({
      id: projectTasks.id,
      title: projectTasks.title,
      since: projectTasks.waitingSince,
      projectId: projects.id,
      name: projects.name,
      discom: discoms.code,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .innerJoin(discoms, eq(discoms.id, projects.discomId))
    .where(
      and(
        eq(projectTasks.status, 'waiting'),
        eq(projectTasks.waitingParty, 'discom'),
        isNotNull(projectTasks.waitingSince),
      ),
    );
  return rows
    .map((row) => ({ row, days: daysSince(row.since, today) }))
    .filter(({ days }) => days >= DISCOM_PATIENCE_DAYS)
    .map(({ row, days }) => ({
      id: `discom-${row.id}`,
      tone: 'waiting' as const,
      title: `${row.title}: waiting ${days} days`,
      detail: `${row.name} · ${row.discom}`,
      action: `Call ${row.discom}`,
      party: 'discom' as const,
      href: `/projects/${row.projectId}`,
    }));
}

async function pendingDiscounts(db: Database): Promise<ActionItem[]> {
  const rows = await db
    .select({ number: quotations.number })
    .from(quotations)
    .where(
      and(
        inArray(quotations.status, ['draft', 'sent']),
        isNull(quotations.discountApprovedByUserId),
        ne(quotations.discountPaise, 0),
      ),
    );
  if (rows.length === 0) return [];
  return [
    {
      id: 'discounts',
      tone: 'review',
      title: plural(rows.length, 'Approve 1 discount', 'Approve # discounts'),
      detail: rows.map((row) => row.number).join(', '),
      action: 'Review',
      party: 'internal',
      href: '/quotations',
    },
  ];
}

async function bankClaims(db: Database): Promise<ActionItem[]> {
  const rows = await db
    .select({
      id: projectTasks.id,
      projectId: projects.id,
      name: projects.name,
      lender: projects.lenderName,
      loan: projects.loanPaise,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(
      and(
        eq(projectTasks.templateKey, 'loan_disbursement_claim'),
        inArray(projectTasks.status, ['ready', 'in_progress']),
      ),
    );
  return rows.map((row) => ({
    id: `claim-${row.id}`,
    tone: 'onTrack' as const,
    title: 'Bank disbursement ready to claim',
    detail: `${row.name} · ${row.lender ?? 'Bank'} · ${formatInrCompact(row.loan)}`,
    action: 'Claim',
    party: 'bank' as const,
    href: `/projects/${row.projectId}`,
  }));
}

async function taskAlerts(db: Database, today: string): Promise<ActionItem[]> {
  const open = await db
    .select({ assignee: projectTasks.assigneeUserId, dueDate: projectTasks.dueDate })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(
      and(
        ne(projectTasks.status, 'completed'),
        inArray(projects.status, ['active', 'operational']),
      ),
    );
  const overdue = open.filter((task) => task.dueDate < today).length;
  const unassigned = open.filter((task) => task.assignee === null).length;
  const items: ActionItem[] = [];
  if (overdue > 0)
    items.push({
      id: 'overdue',
      tone: 'overdue',
      title: plural(overdue, '1 task is overdue', '# tasks are overdue'),
      detail: 'Across live projects',
      action: 'Review',
      party: 'internal',
      href: '/projects',
    });
  if (unassigned > 0)
    items.push({
      id: 'unassigned',
      tone: 'atRisk',
      title: plural(unassigned, '1 task has no one assigned', '# tasks have no one assigned'),
      detail: 'Add people to the roles, or assign by hand',
      action: 'Assign',
      party: 'internal',
      href: '/projects',
    });
  return items;
}

async function leadFollowUps(db: Database, today: string): Promise<ActionItem[]> {
  const rows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(notInArray(leads.stage, ['won', 'lost']), lte(leads.nextActionOn, today)));
  if (rows.length === 0) return [];
  return [
    {
      id: 'leads',
      tone: 'atRisk',
      title: plural(rows.length, '1 lead needs a follow-up', '# leads need a follow-up'),
      detail: 'Due today or earlier',
      action: 'Open leads',
      party: 'internal',
      href: '/leads',
    },
  ];
}
