import { Inject, Injectable } from '@nestjs/common';
import type { BusinessReportQuery, ProfitabilityReport } from '@oneohm/api-contracts';
import { bucketIndexOf, share } from '@oneohm/domain';
import { DATABASE, type Database } from '../../config/core.module';
import { type CsvTable, percent, rupees } from './csv';
import {
  actualCost,
  type BillFact,
  byMarginAscending,
  countsAsCost,
  profit,
  splitEstimate,
  totalOf,
} from './profitability-report.math';
import {
  readBills,
  readDispatches,
  readProjects,
  readQuotedLines,
} from './profitability-report.read';
import { type ReportScope, reportScope } from './report-scope';

type ProjectRow = ProfitabilityReport['byProject'][number];

/** Estimated against actual cost and margin, per project (PRD 3.9, Flow F). */
@Injectable()
export class ProfitabilityReportService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async report(query: BusinessReportQuery): Promise<ProfitabilityReport> {
    const scope = reportScope(query);
    const started = await readProjects(this.db, scope);
    const ids = started.map((project) => project.id);
    const quotationIds = started.flatMap((project) =>
      project.quotation ? [project.quotation.id] : [],
    );
    const [lines, bills, dispatches] = await Promise.all([
      readQuotedLines(this.db, quotationIds),
      readBills(this.db, ids),
      readDispatches(this.db, ids),
    ]);
    const rows = started
      .map((project): ProjectRow => {
        const quote = project.quotation;
        const contractPaise = quote ? quote.totalPaise - quote.taxPaise : 0;
        const estimatedCostPaise = quote?.costPaise ?? 0;
        const actual = actualCost(
          bills.filter((bill) => bill.projectId === project.id),
          dispatches.filter((row) => row.projectId === project.id),
        );
        const actualCostPaise = totalOf(actual);
        const { variancePaise, estimatedMarginRate, marginSoFarRate } = profit(
          contractPaise,
          estimatedCostPaise,
          actualCostPaise,
        );
        return {
          projectId: project.id,
          code: project.code,
          customerName: project.customerName,
          startDate: project.startDate,
          status: project.status === 'active' ? 'in_progress' : 'completed',
          contractPaise,
          estimatedCostPaise,
          estimatedMarginRate,
          actual,
          actualCostPaise,
          variancePaise,
          marginSoFarRate,
        };
      })
      .sort(byMarginAscending);
    const sum = (pick: (row: ProjectRow) => number) =>
      rows.reduce((acc, row) => acc + pick(row), 0);
    const contractPaise = sum((row) => row.contractPaise);
    const estimatedCostPaise = sum((row) => row.estimatedCostPaise);
    const actualCostPaise = sum((row) => row.actualCostPaise);
    return {
      meta: scope.meta,
      totals: {
        projects: rows.length,
        completed: rows.filter((row) => row.status === 'completed').length,
        contractPaise,
        estimatedCostPaise,
        estimatedMarginRate: share(contractPaise - estimatedCostPaise, contractPaise),
        actualCostPaise,
        costUsedRate: share(actualCostPaise, estimatedCostPaise),
        marginSoFarRate: share(contractPaise - actualCostPaise, contractPaise),
        overBudget: rows.filter((row) => row.variancePaise > 0).length,
      },
      cost: {
        estimate: splitEstimate(lines),
        actual: {
          stockPaise: sum((row) => row.actual.stockPaise),
          vendorPaise: sum((row) => row.actual.vendorPaise),
          contractorPaise: sum((row) => row.actual.contractorPaise),
        },
        bills: this.billsByStatus(bills),
      },
      byBucket: this.buckets(scope, rows),
      byProject: rows,
    };
  }

  csv(report: ProfitabilityReport): CsvTable {
    return {
      fileName: `OneOhm profitability ${report.meta.range.start} to ${report.meta.range.end}`,
      headers: [
        'Project',
        'Customer',
        'Started',
        'Status',
        'Contract without GST (₹)',
        'Estimated cost (₹)',
        'Estimated margin %',
        'Stock dispatched (₹)',
        'Vendor bills (₹)',
        'Contractor bills (₹)',
        'Actual cost so far (₹)',
        'Variance (₹)',
        'Margin so far %',
      ],
      rows: report.byProject.map((row) => [
        row.code,
        row.customerName,
        row.startDate,
        row.status === 'completed' ? 'Completed' : 'In progress',
        rupees(row.contractPaise),
        rupees(row.estimatedCostPaise),
        percent(row.estimatedMarginRate),
        rupees(row.actual.stockPaise),
        rupees(row.actual.vendorPaise),
        rupees(row.actual.contractorPaise),
        rupees(row.actualCostPaise),
        rupees(row.variancePaise),
        percent(row.marginSoFarRate),
      ]),
    };
  }

  /** The bills counted in the actual cost, by where they stand. */
  private billsByStatus(bills: readonly BillFact[]) {
    const counted = bills.filter(countsAsCost);
    const of = (status: BillFact['status']) =>
      counted
        .filter((bill) => bill.status === status)
        .reduce((sum, bill) => sum + bill.amountPaise, 0);
    return { pendingPaise: of('pending'), approvedPaise: of('approved'), paidPaise: of('paid') };
  }

  private buckets(scope: ReportScope, rows: readonly ProjectRow[]) {
    const buckets = scope.meta.buckets.map((bucket) => ({
      ...bucket,
      projects: 0,
      contractPaise: 0,
      estimatedCostPaise: 0,
      actualCostPaise: 0,
    }));
    for (const row of rows) {
      const bucket = buckets[bucketIndexOf(scope.meta.buckets, row.startDate)];
      if (!bucket) continue;
      bucket.projects += 1;
      bucket.contractPaise += row.contractPaise;
      bucket.estimatedCostPaise += row.estimatedCostPaise;
      bucket.actualCostPaise += row.actualCostPaise;
    }
    return buckets;
  }
}
