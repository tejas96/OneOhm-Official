import { Inject, Injectable } from '@nestjs/common';
import type { BusinessReportQuery, ServiceReport } from '@oneohm/api-contracts';
import { customerFeedback, projects, serviceRequests, users } from '@oneohm/database';
import { bucketIndexOf, share } from '@oneohm/domain';
import { and, eq, gte, lt, ne, or, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import type { CsvTable } from './csv';
import { average, indiaDate, managedInRange, type ReportScope, reportScope } from './report-scope';

const HOUR_MS = 3_600_000;

interface RequestFact {
  readonly category: string;
  readonly assigneeUserId: string | null;
  readonly assignee: string | null;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
  readonly status: string;
}

/** Service requests raised and resolved, how fast, and how customers rated us (PRD 3.16, 5.7). */
@Injectable()
export class ServiceReportService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async report(query: BusinessReportQuery): Promise<ServiceReport> {
    const scope = reportScope(query);
    const inRange = (at: Date | null) => at !== null && at >= scope.from && at < scope.until;
    const requests = await this.requests(scope);
    const raised = requests.filter((request) => inRange(request.createdAt));
    const resolved = requests.filter((request) => inRange(request.resolvedAt));
    const open = requests.filter((request) => request.status !== 'resolved');
    const hours = (request: RequestFact) =>
      ((request.resolvedAt?.getTime() ?? 0) - request.createdAt.getTime()) / HOUR_MS;
    const ratings = await this.ratings(scope);
    return {
      meta: scope.meta,
      totals: {
        raised: raised.length,
        resolved: resolved.length,
        openNow: open.length,
        averageResolutionHours: average(resolved.map(hours)),
        withinTwoDaysRate: share(
          resolved.filter((request) => hours(request) <= 48).length,
          resolved.length,
        ),
        ratings: ratings.length,
        averageRating: average(ratings),
      },
      byBucket: scope.meta.buckets.map((bucket, index) => ({
        ...bucket,
        raised: raised.filter(
          (request) => bucketIndexOf(scope.meta.buckets, indiaDate(request.createdAt)) === index,
        ).length,
        resolved: resolved.filter(
          (request) =>
            bucketIndexOf(scope.meta.buckets, indiaDate(request.resolvedAt ?? new Date(0))) ===
            index,
        ).length,
      })),
      byCategory: this.group(raised, resolved, open, (request) => request.category).map(
        ({ key, ...row }) => ({ category: key, ...row }),
      ),
      byAssignee: this.group(raised, resolved, open, (request) => request.assigneeUserId ?? '').map(
        ({ key, raised: _raised, ...row }) => ({
          userId: key || null,
          name:
            requests.find((request) => (request.assigneeUserId ?? '') === key)?.assignee ?? null,
          ...row,
        }),
      ),
    };
  }

  csv(report: ServiceReport): CsvTable {
    return {
      fileName: `OneOhm service ${report.meta.range.start} to ${report.meta.range.end}`,
      headers: ['Category', 'Raised', 'Resolved', 'Open now', 'Average hours to resolve'],
      rows: report.byCategory.map((row) => [
        row.category,
        row.raised,
        row.resolved,
        row.openNow,
        row.averageResolutionHours,
      ]),
    };
  }

  /** Requests raised or resolved in the range, or still open; narrowed through their project. */
  private async requests(scope: ReportScope): Promise<RequestFact[]> {
    return this.db
      .select({
        category: serviceRequests.category,
        assigneeUserId: serviceRequests.assigneeUserId,
        assignee: users.fullName,
        createdAt: serviceRequests.createdAt,
        resolvedAt: serviceRequests.resolvedAt,
        status: serviceRequests.status,
      })
      .from(serviceRequests)
      .leftJoin(projects, eq(projects.id, serviceRequests.projectId))
      .leftJoin(users, eq(users.id, serviceRequests.assigneeUserId))
      .where(
        and(
          this.projectFilter(scope),
          or(
            and(
              gte(serviceRequests.createdAt, scope.from),
              lt(serviceRequests.createdAt, scope.until),
            ),
            and(
              gte(serviceRequests.resolvedAt, scope.from),
              lt(serviceRequests.resolvedAt, scope.until),
            ),
            ne(serviceRequests.status, 'resolved'),
          ),
        ),
      );
  }

  private async ratings(scope: ReportScope): Promise<number[]> {
    const rows = await this.db
      .select({ rating: customerFeedback.rating })
      .from(customerFeedback)
      .innerJoin(projects, eq(projects.id, customerFeedback.projectId))
      .where(
        and(
          this.projectFilter(scope),
          gte(customerFeedback.createdAt, scope.from),
          lt(customerFeedback.createdAt, scope.until),
        ),
      );
    return rows.map((row) => row.rating);
  }

  /** A request without a project counts only when no manager or type is chosen. */
  private projectFilter(scope: ReportScope): SQL | undefined {
    return and(
      scope.managerUserId
        ? managedInRange(scope.managerUserId, scope.from, scope.until)
        : undefined,
      scope.projectType ? eq(projects.type, scope.projectType) : undefined,
    );
  }

  private group(
    raised: readonly RequestFact[],
    resolved: readonly RequestFact[],
    open: readonly RequestFact[],
    keyOf: (request: RequestFact) => string,
  ) {
    const keys = new Set([...raised, ...resolved, ...open].map(keyOf));
    return [...keys]
      .map((key) => {
        const done = resolved.filter((request) => keyOf(request) === key);
        return {
          key,
          raised: raised.filter((request) => keyOf(request) === key).length,
          resolved: done.length,
          openNow: open.filter((request) => keyOf(request) === key).length,
          averageResolutionHours: average(
            done.map(
              (request) =>
                ((request.resolvedAt?.getTime() ?? 0) - request.createdAt.getTime()) / HOUR_MS,
            ),
          ),
        };
      })
      .sort((a, b) => b.raised + b.openNow - (a.raised + a.openNow));
  }
}
