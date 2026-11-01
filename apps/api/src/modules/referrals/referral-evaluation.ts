import { type Database, leads, referralRewards, type Transaction } from '@oneohm/database';
import {
  checkReferralLimits,
  eventReachedAt,
  projectTypeEligible,
  referralRewardPaise,
} from '@oneohm/domain';
import { and, asc, gte, isNotNull, ne, sql } from 'drizzle-orm';
import { type ProjectFacts, projectFacts, projectsOfLeads } from './project-events';
import { announceReward } from './referral-messages';
import { loadProgram, type ProgramRow } from './referral-program';

interface Usage {
  campaignPaise: number;
  byCustomer: Map<string, { count: number; paise: number }>;
  projects: Set<string>;
}

/** What the campaign has committed so far: every reward not turned down. */
async function usageOf(tx: Transaction): Promise<Usage> {
  const rows = await tx
    .select({
      customerId: referralRewards.referrerCustomerId,
      projectId: referralRewards.projectId,
      amountPaise: referralRewards.amountPaise,
    })
    .from(referralRewards)
    .where(ne(referralRewards.status, 'rejected'));
  const usage: Usage = { campaignPaise: 0, byCustomer: new Map(), projects: new Set() };
  for (const row of rows) record(usage, row.customerId, row.projectId, row.amountPaise);
  return usage;
}

function record(usage: Usage, customerId: string, projectId: string, amountPaise: number) {
  usage.campaignPaise += amountPaise;
  const mine = usage.byCustomer.get(customerId) ?? { count: 0, paise: 0 };
  usage.byCustomer.set(customerId, { count: mine.count + 1, paise: mine.paise + amountPaise });
  usage.projects.add(projectId);
}

/** The reward this referral earns now, or null when it earns none (yet). */
function rewardFor(
  program: ProgramRow,
  usage: Usage,
  referrerId: string,
  project: ProjectFacts | undefined,
): { amountPaise: number; earnedAt: Date } | null {
  if (!project || project.status === 'cancelled' || usage.projects.has(project.id)) return null;
  // Referring yourself earns nothing.
  if (project.customerId === referrerId) return null;
  if (!projectTypeEligible(program.eligibleTypes, project.type)) return null;
  const earnedAt = eventReachedAt(program.qualifyingEvent, project);
  if (!earnedAt) return null;
  const amountPaise = referralRewardPaise(program, project.capacityWp);
  if (amountPaise <= 0) return null;
  const mine = usage.byCustomer.get(referrerId) ?? { count: 0, paise: 0 };
  const verdict = checkReferralLimits(
    amountPaise,
    {
      budgetPaise: program.budgetPaise,
      perCustomerCount: program.perCustomerCount,
      perCustomerPaise: program.perCustomerPaise,
    },
    { campaignPaise: usage.campaignPaise, customerCount: mine.count, customerPaise: mine.paise },
  );
  return verdict === 'ok' ? { amountPaise, earnedAt } : null;
}

/**
 * Earns a reward, pending approval, for each referral whose project reached the
 * programme's qualifying event (PRD 5.6). Budget and per-customer limits hold; the
 * oldest referral goes first. Runs under a lock, so two runs never overspend.
 */
export async function evaluateReferralRewards(db: Database): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('oneohm:referral_rewards'))`);
    const program = await loadProgram(tx);
    if (!program.saved || !program.active || program.amountPaise <= 0) return 0;
    const since = new Date(`${program.startsOn}T00:00:00+05:30`);
    const referred = await tx
      .select({ id: leads.id, referrerId: leads.referredByCustomerId })
      .from(leads)
      .where(
        and(
          isNotNull(leads.referredByCustomerId),
          gte(leads.createdAt, since),
          sql`not exists (select 1 from ${referralRewards} where ${referralRewards.leadId} = ${leads.id})`,
        ),
      )
      .orderBy(asc(leads.createdAt));
    if (referred.length === 0) return 0;
    const projectOf = await projectsOfLeads(
      tx,
      referred.map((lead) => lead.id),
    );
    const facts = await projectFacts(tx, [...projectOf.values()]);
    const usage = await usageOf(tx);
    let created = 0;
    for (const lead of referred) {
      const projectId = projectOf.get(lead.id);
      if (!lead.referrerId || !projectId) continue;
      const project = facts.get(projectId);
      const reward = rewardFor(program, usage, lead.referrerId, project);
      if (!reward || !project) continue;
      const [row] = await tx
        .insert(referralRewards)
        .values({
          leadId: lead.id,
          referrerCustomerId: lead.referrerId,
          projectId,
          amountPaise: reward.amountPaise,
          basis: program.basis,
          ratePaise: program.amountPaise,
          capacityWp: project.capacityWp,
          qualifyingEvent: program.qualifyingEvent,
          earnedAt: reward.earnedAt,
        })
        .onConflictDoNothing()
        .returning({ id: referralRewards.id });
      if (!row) continue;
      record(usage, lead.referrerId, projectId, reward.amountPaise);
      await announceReward(tx, row.id, null);
      created += 1;
    }
    return created;
  });
}
