import {
  customerActions,
  type DatabaseExecutor,
  paymentMilestones,
  payments,
  projects,
  properties,
  quotations,
  serviceRequests,
} from '@oneohm/database';
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { activeProjectsOf } from '../../customer-portal/active-projects';
import { upcomingVisits } from './upcoming-visits';

/** One thing that needs the customer now, as Home shows it (redesign §3). */
export type PendingItem =
  | { kind: 'paper'; requestId: string; title: string; category: string; home: string | null }
  | { kind: 'pay'; milestoneId: string; leftPaise: number; home: string }
  /** A location the team asked for ([📍 Send location]) and a call time they asked for. */
  | { kind: 'location'; requestId: string; home: string | null }
  | { kind: 'callback'; requestId: string }
  /** A day the team asked the customer to pick for a visit ([Pick a day]). */
  | { kind: 'visit_ask'; requestId: string; home: string | null }
  | { kind: 'visit'; requestId: string; on: string; home: string | null }
  | { kind: 'problem'; requestId: string; description: string; home: string | null }
  | { kind: 'quote'; quotationId: string };

/** What matters first: open ask → money due → visit in 3 days → open problem → quote waiting. */
const ORDER: readonly PendingItem['kind'][] = [
  'paper',
  'pay',
  'location',
  'callback',
  'visit_ask',
  'visit',
  'problem',
  'quote',
];

/** The items in Home's order; within a kind, as they came. */
export function orderPending(items: readonly PendingItem[]): PendingItem[] {
  return [...items].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

/** How a message names a home: the site's name, else its town. */
const homeOf = (label: string | null, city: string | null) => label?.trim() || city || null;

/**
 * Everything that needs this customer now, in Home's order, from one place. Open papers
 * come from the customer actions of type paper (the other types join as their flows are
 * built); then customer instalments due, service visits in the next 3 days, open problems and
 * sent quotations not yet accepted. `today` is the business day (YYYY-MM-DD).
 */
export async function pendingForCustomer(
  db: DatabaseExecutor,
  customerId: string,
  today: string,
): Promise<PendingItem[]> {
  const [papers, due, problems, quotes, asks, upcoming] = await Promise.all([
    openPapers(db, customerId),
    dueInstalments(db, customerId),
    openProblems(db, customerId),
    waitingQuotes(db, customerId, today),
    openAsks(db, customerId),
    upcomingVisits(db, customerId, today),
  ]);
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
    ...asks.map((row) => {
      if (row.type === 'location')
        return { kind: 'location' as const, requestId: row.id, home: homeOf(row.label, row.city) };
      if (row.type === 'visit_pick')
        return { kind: 'visit_ask' as const, requestId: row.id, home: homeOf(row.label, row.city) };
      return { kind: 'callback' as const, requestId: row.id };
    }),
    ...upcoming.map((row) => ({
      kind: 'visit' as const,
      requestId: row.id,
      on: row.day,
      home: homeOf(row.label, row.city),
    })),
    ...problems
      // A problem with a visit coming up shows as that visit.
      .filter((row) => !upcoming.some((visit) => visit.serviceRequestId === row.id))
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
      id: customerActions.id,
      title: customerActions.title,
      category: sql<string>`coalesce(${customerActions.category}, 'other')`,
      label: properties.label,
      city: properties.city,
    })
    .from(customerActions)
    .leftJoin(projects, eq(projects.id, customerActions.projectId))
    .leftJoin(
      properties,
      eq(properties.id, sql`coalesce(${projects.propertyId}, ${customerActions.propertyId})`),
    )
    .where(
      and(
        eq(customerActions.customerId, customerId),
        eq(customerActions.type, 'paper'),
        eq(customerActions.status, 'open'),
        or(isNull(customerActions.projectId), ne(projects.status, 'cancelled')),
      ),
    )
    .orderBy(asc(customerActions.createdAt));
}

/** Location, call-time and visit-day asks that that still wait for the customer. */
function openAsks(db: DatabaseExecutor, customerId: string) {
  return db
    .select({
      id: customerActions.id,
      type: customerActions.type,
      label: properties.label,
      city: properties.city,
    })
    .from(customerActions)
    .leftJoin(properties, eq(properties.id, customerActions.propertyId))
    .where(
      and(
        eq(customerActions.customerId, customerId),
        inArray(customerActions.type, ['location', 'callback', 'visit_pick']),
        eq(customerActions.status, 'open'),
        // A pin waiting for its home is the customer's own move, not an ask of ours (an AMC visit
        // ask is made by the system).
        or(isNotNull(customerActions.requestedByUserId), eq(customerActions.type, 'visit_pick')),
      ),
    )
    .orderBy(asc(customerActions.createdAt));
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
