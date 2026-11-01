import { Inject, Injectable } from '@nestjs/common';
import type { BusinessReportQuery, DeliveryReport } from '@oneohm/api-contracts';
import { bucketIndexOf, EPC_STAGES, onTimeRate } from '@oneohm/domain';
import { daysBetween } from '@oneohm/shared';
import { DATABASE, type Database } from '../../config/core.module';
import { type CsvTable, percent } from './csv';
import {
  daysLate,
  finishedIn,
  openOverdue,
  type ProjectFact,
  readDelivery,
  type TaskFact,
} from './delivery-report.read';
import { average, indiaDate, type ReportScope, reportScope } from './report-scope';

function tally(tasks: readonly TaskFact[]) {
  const late = tasks.filter((task) => daysLate(task) > 0).length;
  const onTime = tasks.length - late;
  return { onTime, late, onTimeRate: onTimeRate(onTime, late) };
}

/** Tasks on time against late, systems commissioned, per project and stage (PRD 3.1, 3.8). */
@Injectable()
export class DeliveryReportService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async report(query: BusinessReportQuery): Promise<DeliveryReport> {
    const scope = reportScope(query);
    const { projects, tasks } = await readDelivery(this.db, scope);
    const range = scope.meta.range;
    const finished = tasks.filter((task) => finishedIn(task, range));
    const overdue = tasks.filter((task) => openOverdue(task, scope.today));
    const commissioned = projects.filter(
      (project) => project.operationalAt && this.inRange(scope, indiaDate(project.operationalAt)),
    );
    return {
      meta: scope.meta,
      totals: {
        tasks: {
          ...tally(finished),
          openOverdue: overdue.length,
          averageDaysLate: average(finished.map(daysLate).filter((days) => days > 0)),
        },
        commissioned: commissioned.length,
        commissionedWp: commissioned.reduce((sum, project) => sum + project.capacityWp, 0),
        averageDaysToCommission: average(
          commissioned.map((project) =>
            daysBetween(project.startDate, indiaDate(project.operationalAt ?? new Date())),
          ),
        ),
        liveProjects: projects.filter((project) => project.status === 'active').length,
      },
      byBucket: this.buckets(scope, finished, commissioned),
      byProject: this.byProject(scope, projects, tasks),
      byStage: EPC_STAGES.map((stage) => {
        const done = finished.filter((task) => task.stage === stage);
        return {
          stage,
          ...tally(done),
          averageDaysLate: average(done.map(daysLate).filter((days) => days > 0)),
          openOverdue: overdue.filter((task) => task.stage === stage).length,
        };
      }),
    };
  }

  csv(report: DeliveryReport): CsvTable {
    return {
      fileName: `OneOhm delivery ${report.meta.range.start} to ${report.meta.range.end}`,
      headers: [
        'Project',
        'Name',
        'Manager',
        'Stage',
        'Tasks on time',
        'Tasks late',
        'On time %',
        'Past due, open',
        'Days running',
      ],
      rows: report.byProject.map((row) => [
        row.code,
        row.name,
        row.manager,
        row.stage,
        row.tasks.onTime,
        row.tasks.late,
        percent(row.tasks.onTimeRate),
        row.openOverdue,
        row.daysRunning,
      ]),
    };
  }

  private inRange(scope: ReportScope, date: string): boolean {
    return date >= scope.meta.range.start && date <= scope.meta.range.end;
  }

  private buckets(
    scope: ReportScope,
    finished: readonly TaskFact[],
    commissioned: readonly ProjectFact[],
  ) {
    const rows = scope.meta.buckets.map((bucket) => ({
      ...bucket,
      onTime: 0,
      late: 0,
      commissionedWp: 0,
    }));
    for (const task of finished) {
      const row = rows[bucketIndexOf(scope.meta.buckets, task.finishedOn ?? '')];
      if (!row) continue;
      if (daysLate(task) > 0) row.late += 1;
      else row.onTime += 1;
    }
    for (const project of commissioned) {
      if (!project.operationalAt) continue;
      const row = rows[bucketIndexOf(scope.meta.buckets, indiaDate(project.operationalAt))];
      if (row) row.commissionedWp += project.capacityWp;
    }
    return rows;
  }

  /** Live projects and any that finished work in the period; the least reliable first. */
  private byProject(
    scope: ReportScope,
    projects: readonly ProjectFact[],
    tasks: readonly TaskFact[],
  ): DeliveryReport['byProject'] {
    return projects
      .map((project) => {
        const own = tasks.filter((task) => task.projectId === project.id);
        const done = own.filter((task) => finishedIn(task, scope.meta.range));
        const end = project.operationalAt ? indiaDate(project.operationalAt) : scope.today;
        return {
          projectId: project.id,
          code: project.code,
          name: project.name,
          manager: project.manager,
          // Same rule as the project screens: the first stage that still has open work.
          stage:
            EPC_STAGES.find((stage) =>
              own.some((task) => task.finishedOn === null && task.stage === stage),
            ) ?? project.stage,
          status: project.status,
          tasks: tally(done),
          openOverdue: own.filter((task) => openOverdue(task, scope.today)).length,
          daysRunning: Math.max(0, daysBetween(project.startDate, end)),
        };
      })
      .filter((row) => row.status === 'active' || row.tasks.onTime + row.tasks.late > 0)
      .sort(
        (a, b) =>
          (a.tasks.onTimeRate ?? 1) - (b.tasks.onTimeRate ?? 1) || b.openOverdue - a.openOverdue,
      );
  }
}
