import type { Lead } from '@oneohm/api-contracts';
import { customers, type DatabaseExecutor, leads, users } from '@oneohm/database';
import { effectiveStep, isLeadLostReason, isRevisitDue, type LeadStage } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { inArray } from 'drizzle-orm';
import { loadLeadSteps } from './lead-steps-read';

const CLOSED: LeadStage[] = ['won', 'lost'];

/**
 * Leads as the API shows them, with owner and referring customer names. With
 * `withMatches`, a lead not yet linked names the customer already on its phone.
 */
export async function presentLeads(
  db: DatabaseExecutor,
  rows: Array<typeof leads.$inferSelect>,
  withMatches = false,
): Promise<Lead[]> {
  const ownerIds = [
    ...new Set(rows.map((row) => row.ownerUserId).filter((id): id is string => id !== null)),
  ];
  const owners = ownerIds.length
    ? await db
        .select({ id: users.id, fullName: users.fullName })
        .from(users)
        .where(inArray(users.id, ownerIds))
    : [];
  const referrerIds = [
    ...new Set(rows.map((row) => row.referredByCustomerId).filter((id) => id !== null)),
  ];
  const referrers = referrerIds.length
    ? await db
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(inArray(customers.id, referrerIds))
    : [];
  const matches = withMatches ? await matchedCustomers(db, rows) : [];
  const steps = await loadLeadSteps(db);
  const today = todayIn();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phoneE164,
    email: row.email,
    city: row.city,
    source: row.source,
    stage: row.stage,
    step: stepOf(effectiveStep(steps, row.stage, row.stepKey)),
    subsidyCategory: row.subsidyCategory,
    estimatedWp: row.estimatedWp,
    owner: owners.find((owner) => owner.id === row.ownerUserId) ?? null,
    nextActionOn: row.nextActionOn,
    nextActionTime: row.nextActionTime,
    nextActionNote: row.nextActionNote,
    overdue: !CLOSED.includes(row.stage) && row.nextActionOn !== null && row.nextActionOn < today,
    customerId: row.customerId,
    propertyId: row.propertyId,
    lostReasonKey:
      row.lostReasonKey && isLeadLostReason(row.lostReasonKey) ? row.lostReasonKey : null,
    lostReason: row.lostReason,
    revisitOn: row.revisitOn,
    revisitDue: isRevisitDue(row, today),
    notes: row.notes,
    referredBy: referrers.find((customer) => customer.id === row.referredByCustomerId) ?? null,
    matchedCustomer: pickMatch(matches, row),
    createdAt: row.createdAt.toISOString(),
  }));
}

type Match = { readonly id: string; readonly name: string; readonly phone: string };

async function matchedCustomers(
  db: DatabaseExecutor,
  rows: Array<typeof leads.$inferSelect>,
): Promise<Match[]> {
  const phones = [...new Set(rows.map((row) => row.phoneE164))];
  if (phones.length === 0) return [];
  return db
    .select({ id: customers.id, name: customers.name, phone: customers.phoneE164 })
    .from(customers)
    .where(inArray(customers.phoneE164, phones));
}

/** The linked customer when there is one, else the customer on the same phone. */
function pickMatch(matches: readonly Match[], row: typeof leads.$inferSelect) {
  const match =
    matches.find((customer) => customer.id === row.customerId) ??
    matches.find((customer) => customer.phone === row.phoneE164);
  return match ? { id: match.id, name: match.name } : null;
}

const stepOf = (step: { key: string; name: string } | null) =>
  step ? { key: step.key, name: step.name } : null;
