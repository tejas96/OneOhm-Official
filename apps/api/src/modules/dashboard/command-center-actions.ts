import type { ActionItem } from '@oneohm/api-contracts';
import {
  chatsWaitingSince,
  type Database,
  discoms,
  leads,
  paymentMilestones,
  projects,
  projectTasks,
  quotations,
  users,
  waConversations,
} from '@oneohm/database';
import { chatWaitStage, type DashboardSettings } from '@oneohm/domain';
import { daysBetween, formatInrCompact } from '@oneohm/shared';
import { and, eq, inArray, isNotNull, isNull, lte, ne, notInArray, or } from 'drizzle-orm';
import { waitsForApproval } from '../lists/quotation-page';
import { assignmentConfirmations } from './command-center-confirm';

/** Late chats are counted on the business clock (the same default the API uses). */
const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIMEZONE ?? 'Asia/Kolkata';

const plural = (count: number, one: string, many: string) =>
  count === 1 ? one : many.replace('#', String(count));
const daysSince = (date: Date | null, today: string) =>
  date ? daysBetween(date.toISOString().slice(0, 10), today) : 0;

/** What needs the owner, most urgent first; each item has one next action (PRD 3.1). */
export async function buildActions(
  db: Database,
  today: string,
  settings: DashboardSettings,
): Promise<ActionItem[]> {
  const groups = await Promise.all([
    latePayments(db, today, settings.paymentLateDays),
    lateChats(db),
    longDiscomWaits(db, today, settings.discomWaitDays),
    pendingDiscounts(db),
    bankClaims(db),
    taskAlerts(db, today),
    assignmentConfirmations(db),
    leadFollowUps(db, today),
    unownedLeads(db),
  ]);
  return groups.flat().slice(0, settings.actionsShown);
}

async function latePayments(db: Database, today: string, lateDays: number): Promise<ActionItem[]> {
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
    .filter(({ days }) => days > lateDays)
    .map(({ row, days }) => ({
      id: `pay-${row.id}`,
      tone: 'overdue' as const,
      title: `${row.label} is ${days} days overdue`,
      detail: `${row.name} · ${formatInrCompact(row.amount)}`,
      action: 'Send reminder',
      party: 'customer' as const,
      href: `/projects/${row.projectId}?tab=payments`,
    }));
}

async function longDiscomWaits(
  db: Database,
  today: string,
  patienceDays: number,
): Promise<ActionItem[]> {
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
    .filter(({ days }) => days >= patienceDays)
    .map(({ row, days }) => ({
      id: `discom-${row.id}`,
      tone: 'waiting' as const,
      title: `${row.title}: waiting ${days} days`,
      detail: `${row.name} · ${row.discom}`,
      action: `Call ${row.discom}`,
      party: 'discom' as const,
      href: `/command-center/tasks?show=waiting&party=discom&project=${row.projectId}`,
    }));
}

async function pendingDiscounts(db: Database): Promise<ActionItem[]> {
  const rows = await db
    .select({ number: quotations.number })
    .from(quotations)
    .where(
      // Only discounts above the limit wait for an approver (same rule as the inbox).
      and(inArray(quotations.status, ['draft', 'sent']), waitsForApproval),
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
      href: '/quotations?filter=approval',
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
    href: '/finance?tab=loans',
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
      href: '/command-center/tasks?show=overdue',
    });
  if (unassigned > 0)
    items.push({
      id: 'unassigned',
      tone: 'atRisk',
      title: plural(unassigned, '1 task has no one assigned', '# tasks have no one assigned'),
      detail: 'Add people to the roles, or assign by hand',
      action: 'Assign',
      party: 'internal',
      href: '/command-center/tasks?show=unassigned',
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
      href: '/leads?filter=due',
    },
  ];
}

/** Open leads with no owner, or whose owner has left: a manager picks one (PRD 3.3). */
async function unownedLeads(db: Database): Promise<ActionItem[]> {
  const rows = await db
    .select({ id: leads.id })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.ownerUserId))
    .where(
      and(
        notInArray(leads.stage, ['won', 'lost']),
        or(isNull(users.id), ne(users.status, 'active')),
      ),
    );
  if (rows.length === 0) return [];
  return [
    {
      id: 'unowned-leads',
      tone: 'atRisk',
      title: plural(rows.length, '1 lead has no owner', '# leads have no owner'),
      detail: 'Pick who follows them up',
      action: 'Assign',
      party: 'internal',
      href: '/leads?filter=unowned',
    },
  ];
}

/**
 * Customers who wrote on WhatsApp and have waited over 2 working hours for a person's
 * answer (the same clock as the reminders). The owner sees how many, not the chats.
 */
async function lateChats(db: Database): Promise<ActionItem[]> {
  const open = await db
    .select({ id: waConversations.id })
    .from(waConversations)
    .where(eq(waConversations.state, 'human'));
  if (open.length === 0) return [];
  const waiting = await chatsWaitingSince(
    db,
    open.map((chat) => chat.id),
  );
  const now = new Date();
  const late = [...waiting.values()].filter(
    (since) => chatWaitStage(since, now, BUSINESS_TIME_ZONE) === 2,
  ).length;
  if (late === 0) return [];
  return [
    {
      id: 'late-chats',
      tone: 'overdue',
      title: plural(
        late,
        '1 customer is waiting for a WhatsApp reply',
        '# customers are waiting for a WhatsApp reply',
      ),
      detail: 'Waiting over 2 working hours',
      action: 'Open chats',
      party: 'internal',
      href: '/today?tab=chats&filter=late',
    },
  ];
}
