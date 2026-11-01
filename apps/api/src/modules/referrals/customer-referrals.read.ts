import type { Referral } from '@oneohm/api-contracts';
import { type DatabaseExecutor, leads, referralRewards } from '@oneohm/database';
import type { LeadStage } from '@oneohm/domain';
import { desc, eq } from 'drizzle-orm';
import { projectFacts, projectsOfLeads } from './project-events';

const REFERRAL_STATUS: Readonly<Record<LeadStage, Referral['status']>> = {
  new: 'received',
  contacted: 'in_progress',
  survey_scheduled: 'in_progress',
  quoted: 'in_progress',
  won: 'ordered',
  lost: 'closed',
};

/**
 * People a customer referred, how each is going and the reward it earned (PRD 5.6).
 * "Installed" only once their system is commissioned, not when the order is won.
 */
export async function customerReferrals(
  db: DatabaseExecutor,
  customerId: string,
): Promise<Referral[]> {
  const rows = await db
    .select({
      id: leads.id,
      name: leads.name,
      stage: leads.stage,
      createdAt: leads.createdAt,
      reward: {
        status: referralRewards.status,
        amountPaise: referralRewards.amountPaise,
        paidOn: referralRewards.paidOn,
      },
    })
    .from(leads)
    .leftJoin(referralRewards, eq(referralRewards.leadId, leads.id))
    .where(eq(leads.referredByCustomerId, customerId))
    .orderBy(desc(leads.createdAt));
  const projectOf = await projectsOfLeads(
    db,
    rows.filter((row) => row.stage === 'won').map((row) => row.id),
  );
  const facts = await projectFacts(db, [...projectOf.values()]);
  const installed = (leadId: string) => {
    const projectId = projectOf.get(leadId);
    return Boolean(projectId && facts.get(projectId)?.commissionedAt);
  };
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: installed(row.id) ? 'installed' : REFERRAL_STATUS[row.stage],
    reward: row.reward?.status ? row.reward : null,
    createdAt: row.createdAt.toISOString(),
  }));
}
