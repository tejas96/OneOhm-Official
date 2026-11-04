import { Inject, Injectable } from '@nestjs/common';
import type { BusinessReportQuery, SalesReport } from '@oneohm/api-contracts';
import { bucketIndexOf, LEAD_SOURCES, share } from '@oneohm/domain';
import { DATABASE, type Database } from '../../config/core.module';
import { type CsvTable, percent, rupees } from './csv';
import { average, indiaDate, type ReportScope, reportScope } from './report-scope';
import { readAdvancePaidLeadIds } from './sales-advance.read';
import { byCampaign } from './sales-campaigns';
import {
  type LeadFact,
  type OrderFact,
  readCampaignNames,
  readCollectedByLead,
  readEstimatedLeadIds,
  readLeads,
  readOrders,
} from './sales-report.read';

const DAY_MS = 86_400_000;
const within = (scope: ReportScope, at: Date | null): at is Date =>
  at !== null && at >= scope.from && at < scope.until;

/** Leads in, quotations out, orders won: the sales pipeline and conversion (PRD 3.1, 3.3). */
@Injectable()
export class SalesReportService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async report(query: BusinessReportQuery): Promise<SalesReport> {
    const scope = reportScope(query);
    const cohort = await readLeads(this.db, scope);
    const orders = await readOrders(
      this.db,
      scope,
      cohort.map((lead) => lead.id),
    );
    const sent = orders.filter((order) => within(scope, order.sentAt));
    const won = orders.filter((order) => within(scope, order.acceptedAt));
    const rejected = orders.filter((order) => within(scope, order.rejectedAt));
    const wonPaise = won.reduce((sum, order) => sum + order.totalPaise, 0);
    const wonLeads = cohort.filter((lead) => lead.wonAt !== null);
    return {
      meta: scope.meta,
      totals: {
        leads: cohort.length,
        quotesSent: sent.length,
        quotesSentWp: sent.reduce((sum, order) => sum + order.capacityWp, 0),
        won: won.length,
        wonPaise,
        wonWp: won.reduce((sum, order) => sum + order.capacityWp, 0),
        lost: cohort.filter((lead) => lead.stage === 'lost').length,
        leadToWonRate: share(wonLeads.length, cohort.length),
        quoteWinRate: share(won.length, won.length + rejected.length),
        averageDaysToWin: average(
          wonLeads
            .filter((lead) => within(scope, lead.wonAt))
            .map((lead) => ((lead.wonAt?.getTime() ?? 0) - lead.createdAt.getTime()) / DAY_MS),
        ),
        averageOrderPaise: won.length ? Math.round(wonPaise / won.length) : null,
      },
      byBucket: this.buckets(scope, cohort, won),
      funnel: this.funnel(cohort, orders),
      bySource: this.bySource(cohort, orders),
      byCampaign: await this.byCampaign(cohort, orders),
      byOwner: this.byOwner(scope, cohort, orders),
      lostReasons: this.lostReasons(cohort),
    };
  }

  csv(report: SalesReport): CsvTable {
    return {
      fileName: `OneOhm sales ${report.meta.range.start} to ${report.meta.range.end}`,
      headers: [
        'Salesperson',
        'Leads',
        'Quotations sent',
        'Orders won',
        'Won (₹)',
        'Lead to order %',
      ],
      rows: report.byOwner.map((row) => [
        row.name ?? 'Unassigned',
        row.leads,
        row.quotesSent,
        row.won,
        rupees(row.wonPaise),
        percent(row.rate),
      ]),
    };
  }

  private buckets(scope: ReportScope, cohort: readonly LeadFact[], won: readonly OrderFact[]) {
    const rows = scope.meta.buckets.map((bucket) => ({ ...bucket, leads: 0, won: 0, wonPaise: 0 }));
    for (const lead of cohort) {
      const row = rows[bucketIndexOf(scope.meta.buckets, indiaDate(lead.createdAt))];
      if (row) row.leads += 1;
    }
    for (const order of won) {
      if (!order.acceptedAt) continue;
      const row = rows[bucketIndexOf(scope.meta.buckets, indiaDate(order.acceptedAt))];
      if (!row) continue;
      row.won += 1;
      row.wonPaise += order.totalPaise;
    }
    return rows;
  }

  private funnel(cohort: readonly LeadFact[], orders: readonly OrderFact[]) {
    const ids = new Set(cohort.map((lead) => lead.id));
    const ofCohort = orders.filter((order) => order.leadId !== null && ids.has(order.leadId));
    const leadsWith = (test: (order: OrderFact) => boolean) =>
      new Set(ofCohort.filter(test).map((order) => order.leadId)).size;
    return {
      leads: cohort.length,
      quoted: leadsWith((order) => order.sentAt !== null),
      won: cohort.filter((lead) => lead.wonAt !== null).length,
      projects: leadsWith((order) => order.hasProject),
    };
  }

  /** Value won per lead: its accepted orders, wherever in time they were accepted. */
  private wonValueByLead(orders: readonly OrderFact[]): Map<string, number> {
    const value = new Map<string, number>();
    for (const order of orders) {
      if (!order.leadId || !order.acceptedAt) continue;
      value.set(order.leadId, (value.get(order.leadId) ?? 0) + order.totalPaise);
    }
    return value;
  }

  private bySource(cohort: readonly LeadFact[], orders: readonly OrderFact[]) {
    const value = this.wonValueByLead(orders);
    return LEAD_SOURCES.map((source) => {
      const leads = cohort.filter((lead) => lead.source === source);
      const won = leads.filter((lead) => lead.wonAt !== null);
      return {
        source,
        leads: leads.length,
        won: won.length,
        wonPaise: won.reduce((sum, lead) => sum + (value.get(lead.id) ?? 0), 0),
        rate: share(won.length, leads.length),
      };
    })
      .filter((row) => row.leads > 0)
      .sort((a, b) => b.leads - a.leads);
  }

  private async byCampaign(cohort: readonly LeadFact[], orders: readonly OrderFact[]) {
    const quotedLeadIds = new Set(
      orders.flatMap((order) => (order.leadId && order.sentAt ? [order.leadId] : [])),
    );
    return byCampaign(
      cohort,
      await readCampaignNames(this.db),
      this.wonValueByLead(orders),
      await readCollectedByLead(
        this.db,
        cohort.map((lead) => lead.id),
      ),
      quotedLeadIds,
      await readEstimatedLeadIds(
        this.db,
        cohort.map((lead) => lead.id),
      ),
      await readAdvancePaidLeadIds(
        this.db,
        cohort.map((lead) => lead.id),
      ),
    );
  }

  private byOwner(scope: ReportScope, cohort: readonly LeadFact[], orders: readonly OrderFact[]) {
    type Row = SalesReport['byOwner'][number];
    const rows = new Map<string, Row>();
    const row = (userId: string | null, name: string | null): Row => {
      const key = userId ?? 'none';
      const found = rows.get(key);
      if (found) return found;
      const fresh: Row = {
        userId,
        name,
        leads: 0,
        quotesSent: 0,
        won: 0,
        wonPaise: 0,
        leadsWon: 0,
        rate: null,
      };
      rows.set(key, fresh);
      return fresh;
    };
    for (const lead of cohort) {
      const entry = row(lead.ownerUserId, lead.owner);
      entry.leads += 1;
      if (lead.wonAt) entry.leadsWon += 1;
    }
    for (const order of orders) {
      const entry = row(order.ownerUserId, order.owner);
      if (within(scope, order.sentAt)) entry.quotesSent += 1;
      if (within(scope, order.acceptedAt)) {
        entry.won += 1;
        entry.wonPaise += order.totalPaise;
      }
    }
    return [...rows.values()]
      .filter((entry) => entry.leads + entry.quotesSent + entry.won > 0)
      .map((entry) => ({ ...entry, rate: share(entry.leadsWon, entry.leads) }))
      .sort((a, b) => b.wonPaise - a.wonPaise || b.leads - a.leads);
  }

  private lostReasons(cohort: readonly LeadFact[]) {
    const counts = new Map<string, number>();
    for (const lead of cohort) {
      if (lead.stage !== 'lost') continue;
      const reason = lead.lostReason?.trim() || '';
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }
}
