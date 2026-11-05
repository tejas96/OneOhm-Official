import {
  customers,
  type DatabaseExecutor,
  leads,
  type Notice,
  notifyCover,
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

/** The project's manager and the owner of the lead it came from (either may be empty). */
async function peopleOf(db: DatabaseExecutor, projectId: string) {
  const [row] = await db
    .select({ manager: projects.managerUserId, lead: leads.ownerUserId })
    .from(projects)
    .innerJoin(quotations, eq(quotations.id, projects.quotationId))
    .leftJoin(leads, eq(leads.id, quotations.leadId))
    .where(eq(projects.id, projectId))
    .limit(1);
  return { manager: row?.manager ?? null, leadOwner: row?.lead ?? null };
}

/**
 * Tells each person (or whoever covers for them today) once per key; with nobody covering,
 * the people who run projects hear instead.
 */
async function tellEach(db: DatabaseExecutor, ids: readonly (string | null)[], notice: Notice) {
  for (const id of ids) if (id) await notifyCover(db, id, 'projects.manage', notice);
}

/** Tells the project's owner: its manager, else the lead's owner (or their cover today). */
async function tellOwner(db: DatabaseExecutor, projectId: string, notice: Notice): Promise<void> {
  const { manager, leadOwner } = await peopleOf(db, projectId);
  await tellEach(db, [manager ?? leadOwner], notice);
}

/**
 * Tells the project manager, the lead's owner and the accounts team, once each (the
 * per-person key makes someone in two of them hear once).
 */
async function tellTeamAndAccounts(
  db: DatabaseExecutor,
  projectId: string,
  notice: Notice,
): Promise<void> {
  const { manager, leadOwner } = await peopleOf(db, projectId);
  await tellEach(db, [manager, leadOwner], notice);
  await notifyHolders(db, 'finance.record_payments', notice);
}

/**
 * An online payment just landed: the project manager, the sales owner and accounts hear
 * of it, in the same transaction (live review B7: the job is real now).
 */
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
  await tellTeamAndAccounts(db, paid.projectId, {
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
  // Wait for any payment being recorded on this milestone: recordPayment holds this lock
  // until it commits. The read below is a separate statement, so it sees that payment.
  const [link] = await db
    .select({ milestoneId: paymentLinks.milestoneId })
    .from(paymentLinks)
    .where(eq(paymentLinks.id, linkId))
    .limit(1);
  if (!link) return;
  await db
    .select({ id: paymentMilestones.id })
    .from(paymentMilestones)
    .where(eq(paymentMilestones.id, link.milestoneId))
    .for('update');
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
  // The customer sent proof of payment: no fresh Pay now while finance records it (2 days).
  const waiting = (milestone.remindersPausedUntil?.getTime() ?? 0) > Date.now();
  if (!waiting) {
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
  }
  await tellOwner(db, project.id, {
    kind: 'payment_link_expired',
    title: 'Payment link expired',
    body: `${customer.name}'s link for ${milestone.label} (${project.code}) expired unpaid. ${waiting ? 'The customer sent proof of payment, so no new link was sent.' : 'A fresh Pay now was sent.'}`,
    subject: { type: 'project', id: project.id, projectId: project.id },
    dedupeKey: `link_expired:${linkId}`,
  });
}
