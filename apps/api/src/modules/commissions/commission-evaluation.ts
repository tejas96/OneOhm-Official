import { commissionEntries, type Database } from '@oneohm/database';
import { commissionPaise, eventReachedAt } from '@oneohm/domain';
import { sql } from 'drizzle-orm';
import { type ProjectFacts, projectFacts, projectsOfLeads } from '../referrals/project-events';
import { announceCommission } from './commission-messages';
import { effectiveRule, loadRules, type RuleRow } from './commission-rules';
import { type AttributedLead, resellerLeads, resellers } from './reseller-attribution';

/** The commission a sold project earns now, or null when it earns none (yet). */
function entryFor(
  rules: readonly RuleRow[],
  lead: AttributedLead,
  project: ProjectFacts | undefined,
): typeof commissionEntries.$inferInsert | null {
  if (!project || project.status === 'cancelled') return null;
  const { rule } = effectiveRule(rules, lead.resellerId);
  if (!rule?.active) return null;
  const earnedAt = eventReachedAt(rule.qualifyingEvent, project);
  const amountPaise = commissionPaise(rule, project);
  if (!earnedAt || amountPaise <= 0) return null;
  return {
    resellerUserId: lead.resellerId,
    leadId: lead.id,
    projectId: project.id,
    amountPaise,
    basis: rule.basis,
    rateBp: rule.rateBp,
    perKwPaise: rule.perKwPaise,
    projectValuePaise: project.valuePaise,
    capacityWp: project.capacityWp,
    qualifyingEvent: rule.qualifyingEvent,
    earnedAt,
  };
}

/**
 * Earns commission, pending approval, on each project a reseller sold once it reaches
 * the reseller's rule event (PRD 4.8). One entry per project; runs under a lock.
 */
export async function evaluateCommissions(db: Database): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('oneohm:commissions'))`);
    const rules = await loadRules(tx);
    if (!rules.some((rule) => rule.active)) return 0;
    const people = await resellers(tx);
    const sold = await resellerLeads(
      tx,
      people.map((person) => person.id),
    );
    if (sold.length === 0) return 0;
    const projectOf = await projectsOfLeads(
      tx,
      sold.map((lead) => lead.id),
    );
    const earned = await tx
      .select({ projectId: commissionEntries.projectId })
      .from(commissionEntries);
    const done = new Set(earned.map((row) => row.projectId));
    const facts = await projectFacts(
      tx,
      [...projectOf.values()].filter((id) => !done.has(id)),
    );
    let created = 0;
    for (const lead of sold) {
      const projectId = projectOf.get(lead.id);
      if (!projectId || done.has(projectId)) continue;
      const values = entryFor(rules, lead, facts.get(projectId));
      if (!values) continue;
      const [row] = await tx
        .insert(commissionEntries)
        .values(values)
        .onConflictDoNothing()
        .returning({ id: commissionEntries.id });
      done.add(projectId);
      if (!row) continue;
      await announceCommission(tx, row.id, null);
      created += 1;
    }
    return created;
  });
}
