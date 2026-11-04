import {
  type DatabaseExecutor,
  documentRequests,
  paymentMilestones,
  payments,
  projects,
  properties,
  quotations,
  serviceRequests,
} from '@oneohm/database';
import { addDays } from '@oneohm/shared';
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { activeProjectsOf } from '../../customer-portal/active-projects';

/** One thing that needs the customer now, as Home shows it (redesign §3). */
export type PendingItem =
  | { kind: 'paper'; requestId: string; title: string; category: string; home: string | null }
  | { kind: 'pay'; milestoneId: string; leftPaise: number; home: string }
  | { kind: 'visit'; requestId: string; on: string; home: string | null }
  | { kind: 'problem'; requestId: string; description: string; home: string | null }
  | { kind: 'quote'; quotationId: string };

/** What matters first: open ask → money due → visit in 3 days → open problem → quote waiting. */
const ORDER: readonly PendingItem['kind'][] = ['paper', 'pay', 'visit', 'problem', 'quote'];

/** Visits this many days ahead show on Home. */
export const VISIT_DAYS = 3;

/** The items in Home's order; within a kind, as they came. */
export function orderPending(items: readonly PendingItem[]): PendingItem[] {
  return [...items].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

/** How a message names a home: the site's name, else its town. */
const homeOf = (label: string | null, city: string | null) => label?.trim() || city || null;

/**
 * Everything that needs this customer now, in Home's order, from one place. Open papers
 * come from the paper requests for now (phase 1b: "customer actions" replace this source);
 * then customer instalments due, service visits in the next 3 days, open problems and
 * sent quotations not yet accepted. `today` is the business day (YYYY-MM-DD).
 */
export async function pendingForCustomer(
  db: DatabaseExecutor,
  customerId: string,
  today: string,
): Promise<PendingItem[]> {
  const [papers, due, problems, quotes] = await Promise.all([
    openPapers(db, customerId),
    dueInstalments(db, customerId),
    openProblems(db, customerId),
    waitingQuotes(db, customerId, today),
  ]);
  const until = addDays(today, VISIT_DAYS);
  const visits = problems.filter(
    (row) => row.visitOn && row.visitOn >= today && row.visitOn <= until,
  );
  return orderPending([
    ...papers.map((row) => ({
      kind: 'paper' as const,
      requestId: row.id,
      title: row.title,
      category: row.category,
      home: homeOf(row.label, row.city),
    })),
    ...due.flatMap((row) => {
      const leftPaise = row.amount - Number(row.paid);
      return leftPaise > 0
        ? [
            {
              kind: 'pay' as const,
              milestoneId: row.id,
              leftPaise,
              home: homeOf(row.label, row.city) ?? '',
            },
          ]
        : [];
    }),
    ...visits.map((row) => ({
      kind: 'visit' as const,
      requestId: row.id,
      on: row.visitOn ?? today,
      home: homeOf(row.label, row.city),
    })),
    ...problems
      .filter((row) => !visits.includes(row))
      .map((row) => ({
        kind: 'problem' as const,
        requestId: row.id,
        description: row.description,
        home: homeOf(row.label, row.city),
      })),
    ...quotes.map((row) => ({ kind: 'quote' as const, quotationId: row.id })),
  ]);
}

/** Paper requests still open, oldest first, with their home (none for an ID paper). */
function openPapers(db: DatabaseExecutor, customerId: string) {
  return db
    .select({
      id: documentRequests.id,
      title: documentRequests.title,
      category: documentRequests.category,
      label: properties.label,
      city: properties.city,
    })
    .from(documentRequests)
    .leftJoin(projects, eq(projects.id, documentRequests.projectId))
    .leftJoin(properties, eq(properties.id, projects.propertyId))
    .where(
      and(
        eq(documentRequests.customerId, customerId),
        eq(documentRequests.status, 'open'),
        or(isNull(documentRequests.projectId), ne(projects.status, 'cancelled')),
      ),
    )
    .orderBy(asc(documentRequests.createdAt));
}

/** The customer's own instalments due now on active projects, with what is paid. */
function dueInstalments(db: DatabaseExecutor, customerId: string) {
  return db
    .select({
      id: paymentMilestones.id,
      amount: paymentMilestones.amountPaise,
      label: properties.label,
      city: properties.city,
      paid: sql<string>`coalesce((select sum(${payments.amountPaise}) from ${payments} where ${payments.milestoneId} = ${paymentMilestones.id}), 0)`,
    })
    .from(paymentMilestones)
    .innerJoin(projects, eq(projects.id, paymentMilestones.projectId))
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .where(
      and(
        activeProjectsOf(customerId),
        eq(paymentMilestones.payer, 'customer'),
        inArray(paymentMilestones.status, ['due', 'partly_paid']),
      ),
    )
    .orderBy(asc(projects.createdAt), asc(paymentMilestones.position));
}

/** Problems not yet resolved, newest first, with any technician visit day. */
function openProblems(db: DatabaseExecutor, customerId: string) {
  return db
    .select({
      id: serviceRequests.id,
      description: serviceRequests.description,
      visitOn: serviceRequests.visitOn,
      label: properties.label,
      city: properties.city,
    })
    .from(serviceRequests)
    .leftJoin(projects, eq(projects.id, serviceRequests.projectId))
    .leftJoin(properties, eq(properties.id, projects.propertyId))
    .where(
      and(
        eq(serviceRequests.customerId, customerId),
        inArray(serviceRequests.status, ['open', 'in_progress']),
      ),
    )
    .orderBy(desc(serviceRequests.createdAt));
}

/** Sent quotations still valid and not accepted: the newest revision of each. */
async function waitingQuotes(db: DatabaseExecutor, customerId: string, today: string) {
  const rows = await db
    .select({
      id: quotations.id,
      number: quotations.number,
      status: quotations.status,
      validUntil: quotations.validUntil,
    })
    .from(quotations)
    .where(
      and(eq(quotations.customerId, customerId), inArray(quotations.status, ['sent', 'accepted'])),
    )
    .orderBy(desc(quotations.revision), desc(quotations.createdAt));
  const seen = new Set<string>();
  return rows
    .filter((row) => !seen.has(row.number) && seen.add(row.number))
    .filter((row) => row.status === 'sent' && row.validUntil >= today);
}
