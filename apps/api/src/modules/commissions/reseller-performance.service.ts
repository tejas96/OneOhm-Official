import { Inject, Injectable } from '@nestjs/common';
import type { ResellerPerformance } from '@oneohm/api-contracts';
import { commissionEntries } from '@oneohm/database';
import { conversionBp, incentiveTotals } from '@oneohm/domain';
import { DATABASE, type Database } from '../../config/core.module';
import { projectFacts, projectsOfLeads } from '../referrals/project-events';
import { evaluateCommissions } from './commission-evaluation';
import { effectiveRule, loadRules, presentRule } from './commission-rules';
import { resellerLeads, resellers } from './reseller-attribution';

/** Leads, conversion, value sold and commission for every reseller (PRD 3.3, 4.8). */
@Injectable()
export class ResellerPerformanceService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<ResellerPerformance[]> {
    await evaluateCommissions(this.db);
    const people = await resellers(this.db);
    const leads = await resellerLeads(
      this.db,
      people.map((person) => person.id),
    );
    const projectOf = await projectsOfLeads(
      this.db,
      leads.map((lead) => lead.id),
    );
    const facts = await projectFacts(this.db, [...projectOf.values()]);
    const entries = await this.db
      .select({
        resellerId: commissionEntries.resellerUserId,
        status: commissionEntries.status,
        amountPaise: commissionEntries.amountPaise,
      })
      .from(commissionEntries);
    const rules = await loadRules(this.db);
    return people.map((person) => {
      const own = leads.filter((lead) => lead.resellerId === person.id);
      const sold = [
        ...new Set(own.map((lead) => projectOf.get(lead.id)).filter((id) => id !== undefined)),
      ]
        .map((id) => facts.get(id))
        .filter((project) => project !== undefined && project.status !== 'cancelled');
      const won = own.filter((lead) => lead.stage === 'won').length;
      const { rule, custom } = effectiveRule(rules, person.id);
      return {
        reseller: person,
        leads: own.length,
        openLeads: own.filter((lead) => lead.stage !== 'won' && lead.stage !== 'lost').length,
        won,
        lost: own.filter((lead) => lead.stage === 'lost').length,
        conversionBp: conversionBp(own.length, won),
        projects: sold.length,
        valueSoldPaise: sold.reduce((sum, project) => sum + (project?.valuePaise ?? 0), 0),
        capacitySoldWp: sold.reduce((sum, project) => sum + (project?.capacityWp ?? 0), 0),
        totals: incentiveTotals(entries.filter((entry) => entry.resellerId === person.id)),
        rule: presentRule(rule, custom ? { id: person.id, fullName: person.fullName } : null),
        customRule: custom,
      };
    });
  }
}
