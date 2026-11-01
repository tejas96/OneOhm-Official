import { Inject, Injectable } from '@nestjs/common';
import type { BusinessReportQuery, CollectionsReport } from '@oneohm/api-contracts';
import { bucketIndexOf } from '@oneohm/domain';
import { DATABASE, type Database } from '../../config/core.module';
import {
  ageingRows,
  collectionRate,
  type MilestoneFact,
  type MoneyMove,
  methodRows,
  netByPayer,
  standing,
} from './collections-report.math';
import {
  type ProjectFact,
  readMilestones,
  readMoneyMoves,
  readPaidByProject,
  readProjects,
} from './collections-report.read';
import { type CsvTable, rupees } from './csv';
import { type ReportScope, reportScope } from './report-scope';

type ProjectRow = CollectionsReport['byProject'][number];

/** Money collected, still owed and how old it is (PRD 3.1, 3.11). */
@Injectable()
export class CollectionsReportService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async report(query: BusinessReportQuery): Promise<CollectionsReport> {
    const scope = reportScope(query);
    const live = await readProjects(this.db, scope);
    const ids = live.map((project) => project.id);
    const [milestones, paidBy, moves] = await Promise.all([
      readMilestones(this.db, ids),
      readPaidByProject(this.db, ids),
      readMoneyMoves(this.db, scope),
    ]);
    const net = netByPayer(moves);
    const byProject = this.byProject(scope.today, live, milestones, paidBy);
    return {
      meta: scope.meta,
      totals: {
        collectedPaise: net.customerPaise + net.bankPaise,
        collectedCustomerPaise: net.customerPaise,
        collectedBankPaise: net.bankPaise,
        receivedPaise: moves
          .filter((move) => move.amountPaise > 0)
          .reduce((sum, move) => sum + move.amountPaise, 0),
        returnedPaise: moves
          .filter((move) => move.amountPaise < 0)
          .reduce((sum, move) => sum - move.amountPaise, 0),
        ...this.owed(scope.today, milestones),
        ...collectionRate(milestones, scope.meta.range),
      },
      byBucket: this.buckets(scope, moves),
      byProject,
      ageing: ageingRows(milestones, scope.today),
      byMethod: methodRows(moves),
    };
  }

  csv(report: CollectionsReport): CsvTable {
    return {
      fileName: `OneOhm collections ${report.meta.range.start} to ${report.meta.range.end}`,
      headers: [
        'Project',
        'Customer',
        'Contract with GST (₹)',
        'Paid so far (₹)',
        'Due and unpaid (₹)',
        'Overdue (₹)',
        'Not due yet (₹)',
        'Oldest overdue (days)',
      ],
      rows: report.byProject.map((row) => [
        row.code,
        row.customerName,
        rupees(row.contractPaise),
        rupees(row.paidPaise),
        rupees(row.owedPaise),
        rupees(row.overduePaise),
        rupees(row.notDueYetPaise),
        row.oldestOverdueDays,
      ]),
    };
  }

  /** Today's position: due and unpaid by payer, not due yet, overdue and the oldest. */
  private owed(today: string, milestones: readonly MilestoneFact[]) {
    const owed = { customer: 0, bank: 0, notDueYet: 0, overdue: 0, count: 0 };
    let oldest: number | null = null;
    for (const milestone of milestones) {
      const now = standing(milestone, today);
      if (now.outstandingPaise === 0) continue;
      if (!now.due) owed.notDueYet += now.outstandingPaise;
      else owed[milestone.payer] += now.outstandingPaise;
      if (!now.overdue || now.daysPastDue === null) continue;
      owed.overdue += now.outstandingPaise;
      owed.count += 1;
      oldest = Math.max(oldest ?? 0, now.daysPastDue);
    }
    return {
      owedCustomerPaise: owed.customer,
      owedBankPaise: owed.bank,
      notDueYetPaise: owed.notDueYet,
      overduePaise: owed.overdue,
      overdueCount: owed.count,
      oldestOverdueDays: oldest,
    };
  }

  private buckets(scope: ReportScope, moves: readonly MoneyMove[]) {
    const rows = scope.meta.buckets.map((bucket) => ({
      ...bucket,
      customerPaise: 0,
      bankPaise: 0,
    }));
    for (const move of moves) {
      const row = rows[bucketIndexOf(scope.meta.buckets, move.on)];
      if (!row) continue;
      if (move.payer === 'bank') row.bankPaise += move.amountPaise;
      else row.customerPaise += move.amountPaise;
    }
    return rows;
  }

  private byProject(
    today: string,
    live: readonly ProjectFact[],
    milestones: readonly MilestoneFact[],
    paidBy: ReadonlyMap<string, number>,
  ): ProjectRow[] {
    return live
      .map((project): ProjectRow => {
        const own = milestones.filter((milestone) => milestone.projectId === project.id);
        const position = this.owed(today, own);
        return {
          projectId: project.id,
          code: project.code,
          customerName: project.customerName,
          contractPaise: project.contractPaise,
          paidPaise: paidBy.get(project.id) ?? 0,
          owedPaise: position.owedCustomerPaise + position.owedBankPaise,
          notDueYetPaise: position.notDueYetPaise,
          overduePaise: position.overduePaise,
          oldestOverdueDays: position.oldestOverdueDays,
        };
      })
      .filter((row) => row.owedPaise + row.notDueYetPaise > 0)
      .sort(
        (a, b) =>
          (b.oldestOverdueDays ?? -1) - (a.oldestOverdueDays ?? -1) ||
          b.owedPaise - a.owedPaise ||
          b.notDueYetPaise - a.notDueYetPaise ||
          a.code.localeCompare(b.code),
      );
  }
}
