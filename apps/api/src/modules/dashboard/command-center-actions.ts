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

/** What needs the owner, most urgent first; each item has one next action (PRD 3.1). */
export async function buildActions(db: Database, today: string): Promise<ActionItem[]> {
  const items: ActionItem[] = [];

  const late = await db
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
  for (const milestone of late) {
    const days = milestone.dueAt
      ? daysBetween(milestone.dueAt.toISOString().slice(0, 10), today)
      : 0;
    if (days <= PAYMENT_GRACE_DAYS) continue;
    items.push({
      id: `pay-${milestone.id}`,
      tone: 'overdue',
      title: `${milestone.label} is ${days} days overdue`,
      detail: `${milestone.name} · ${formatInrCompact(milestone.amount)}`,
      action: 'Send reminder',
      party: 'customer',
      href: `/projects/${milestone.projectId}`,
    });
  }

  const waiting = await db
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
  for (const task of waiting) {
    const days = task.since ? daysBetween(task.since.toISOString().slice(0, 10), today) : 0;
    if (days < DISCOM_PATIENCE_DAYS) continue;
    items.push({
      id: `discom-${task.id}`,
      tone: 'waiting',
      title: `${task.title}: waiting ${days} days`,
      detail: `${task.name} · ${task.discom}`,
      action: `Call ${task.discom}`,
      party: 'discom',
      href: `/projects/${task.projectId}`,
    });
  }

  const pending = await db
    .select({ id: quotations.id, number: quotations.number })
    .from(quotations)
    .where(
      and(
        inArray(quotations.status, ['draft', 'sent']),
        isNull(quotations.discountApprovedByUserId),
        ne(quotations.discountPaise, 0),
      ),
    );
  if (pending.length > 0) {
    items.push({
      id: 'discounts',
      tone: 'review',
      title: pending.length === 1 ? 'Approve 1 discount' : `Approve ${pending.length} discounts`,
      detail: pending.map((row) => row.number).join(', '),
      action: 'Review',
      party: 'internal',
      href: '/quotations',
    });
  }

  const claims = await db
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
  for (const claim of claims) {
    items.push({
      id: `claim-${claim.id}`,
      tone: 'onTrack',
      title: 'Bank disbursement ready to claim',
      detail: `${claim.name} · ${claim.lender ?? 'Bank'} · ${formatInrCompact(claim.loan)}`,
      action: 'Claim',
      party: 'bank',
      href: `/projects/${claim.projectId}`,
    });
  }

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
  const unassigned = open.filter((task) => task.assignee === null).length;
  const overdue = open.filter((task) => task.dueDate < today).length;
  if (overdue > 0)
    items.push({
      id: 'overdue',
      tone: 'overdue',
      title: overdue === 1 ? '1 task is overdue' : `${overdue} tasks are overdue`,
      detail: 'Across live projects',
      action: 'Review',
      party: 'internal',
      href: '/projects',
    });
  if (unassigned > 0)
    items.push({
      id: 'unassigned',
      tone: 'atRisk',
      title:
        unassigned === 1
          ? '1 task has no one assigned'
          : `${unassigned} tasks have no one assigned`,
      detail: 'Add people to the roles, or assign by hand',
      action: 'Assign',
      party: 'internal',
      href: '/projects',
    });

  const followUps = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(notInArray(leads.stage, ['won', 'lost']), lte(leads.nextActionOn, today)));
  if (followUps.length > 0)
    items.push({
      id: 'leads',
      tone: 'atRisk',
      title:
        followUps.length === 1
          ? '1 lead needs a follow-up'
          : `${followUps.length} leads need a follow-up`,
      detail: 'Due today or earlier',
      action: 'Open leads',
      party: 'internal',
      href: '/leads',
    });

  return items.slice(0, 6);
}
