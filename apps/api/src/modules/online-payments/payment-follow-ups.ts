import {
  customers,
  type DatabaseExecutor,
  leads,
  notify,
  notifyHolders,
  paymentLinks,
  paymentMilestones,
  payments,
  projects,
  quotations,
} from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { eq, sql } from 'drizzle-orm';
import { queueWhatsApp } from '../../common/outbox';
import { environmentOnce } from '../../config/environment-once';
import { payNowPayload } from './pay-now-message';

/** Who looks after a project's money: its manager, else the owner of the lead it came from. */
async function ownerOf(db: DatabaseExecutor, projectId: string): Promise<string | null> {
  const [row] = await db
    .select({ manager: projects.managerUserId, lead: leads.ownerUserId })
    .from(projects)
    .innerJoin(quotations, eq(quotations.id, projects.quotationId))
    .leftJoin(leads, eq(leads.id, quotations.leadId))
    .where(eq(projects.id, projectId))
    .limit(1);
  return row?.manager ?? row?.lead ?? null;
}

/** Tells the project's owner (when it has one) and the accounts team, once per key. */
async function tellOwnerAndAccounts(
  db: DatabaseExecutor,
  projectId: string,
  notice: Parameters<typeof notifyHolders>[2],
): Promise<void> {
  const owner = await ownerOf(db, projectId);
  if (owner)
    await notify(db, { userId: owner }, { ...notice, dedupeKey: `${notice.dedupeKey}:${owner}` });
  await notifyHolders(db, 'finance.record_payments', notice);
}

/** An online payment just landed: the owner and accounts hear of it, in the same transaction. */
export async function tellStaffPaidOnline(
  db: DatabaseExecutor,
  paid: {
    paymentId: string;
    projectId: string;
    amountPaise: number;
    customerName: string;
    milestoneLabel: string;
  },
): Promise<void> {
  await tellOwnerAndAccounts(db, paid.projectId, {
    kind: 'payment_online',
    title: 'Online payment received',
    body: `${formatInr(paid.amountPaise)} paid online by ${paid.customerName} for ${paid.milestoneLabel}`,
    subject: { type: 'payment', id: paid.paymentId, projectId: paid.projectId },
    dedupeKey: `payment_online:${paid.paymentId}`,
  });
}

/**
 * A pay link ran out. While the milestone still has money owing, the customer gets one
 * fresh "Pay now" and the owner is told. Called only when the link was closed just now.
 */
export async function sendFreshLinkAfterExpiry(
  db: DatabaseExecutor,
  linkId: string,
): Promise<void> {
  const [row] = await db
    .select({
      milestone: paymentMilestones,
      project: { id: projects.id, code: projects.code, customerId: projects.customerId },
      customer: { name: customers.name, phone: customers.phoneE164 },
      paidPaise: sql<string>`coalesce((select sum(${payments.amountPaise}) from ${payments} where ${payments.milestoneId} = ${paymentMilestones.id}), 0)`,
    })
    .from(paymentLinks)
    .innerJoin(paymentMilestones, eq(paymentMilestones.id, paymentLinks.milestoneId))
    .innerJoin(projects, eq(projects.id, paymentLinks.projectId))
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .where(eq(paymentLinks.id, linkId))
    .limit(1);
  if (!row) return;
  const { milestone, project, customer } = row;
  const owed = milestone.amountPaise - Number(row.paidPaise);
  if ((milestone.status !== 'due' && milestone.status !== 'partly_paid') || owed <= 0) return;
  await queueWhatsApp(
    db,
    customer.phone,
    'payment_link',
    payNowPayload(environmentOnce(), {
      customerName: customer.name,
      customerId: project.customerId,
      projectCode: project.code,
      milestoneId: milestone.id,
      milestoneLabel: milestone.label,
      owedPaise: owed,
    }),
    `link_expired:${linkId}`,
  );
  await tellOwnerAndAccounts(db, project.id, {
    kind: 'payment_link_expired',
    title: 'Payment link expired',
    body: `${customer.name}'s link for ${milestone.label} (${project.code}) expired unpaid. A fresh Pay now was sent.`,
    subject: { type: 'project', id: project.id, projectId: project.id },
    dedupeKey: `link_expired:${linkId}`,
  });
}
