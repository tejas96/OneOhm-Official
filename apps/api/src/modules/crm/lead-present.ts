import type { Lead } from '@oneohm/api-contracts';
import { customers, leads, users } from '@oneohm/database';
import { effectiveStep, type LeadStage } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { inArray } from 'drizzle-orm';
import type { Database } from '../../config/core.module';
import { loadLeadSteps } from './lead-steps-read';

const CLOSED: LeadStage[] = ['won', 'lost'];

/** Leads as the API shows them, with owner and referring customer names. */
export async function presentLeads(
  db: Database,
  rows: Array<typeof leads.$inferSelect>,
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
    nextActionNote: row.nextActionNote,
    overdue: !CLOSED.includes(row.stage) && row.nextActionOn !== null && row.nextActionOn < today,
    customerId: row.customerId,
    propertyId: row.propertyId,
    lostReason: row.lostReason,
    notes: row.notes,
    referredBy: referrers.find((customer) => customer.id === row.referredByCustomerId) ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

const stepOf = (step: { key: string; name: string } | null) =>
  step ? { key: step.key, name: step.name } : null;
