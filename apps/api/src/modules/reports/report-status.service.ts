import { Inject, Injectable } from '@nestjs/common';
import type { ReportOverview, ReportStatus } from '@oneohm/api-contracts';
import {
  customers,
  discoms,
  projectFacts,
  projects,
  projectTasks,
  properties,
} from '@oneohm/database';
import { TASK_DATE_FACTS, taskDateFacts } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { desc, eq, ne } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { CatalogService } from '../catalog/catalog.service';
import { CompanyAssetsService } from '../documents/company-assets.service';
import { filingOf, loadFiling } from './report-filing';
import { reportFingerprint } from './report-fingerprint';
import { ReportFormatsStore } from './report-formats.store';
import {
  notNeeded,
  projectReports,
  projectStatuses,
  type ReportContext,
  reportStatus,
} from './report-readiness';
import { reportValues } from './report-values';

export type { ReportContext } from './report-readiness';

/** The project details a printed report needs beyond its facts. */
export interface ReportProject extends ReportContext {
  readonly code: string;
  readonly type: 'residential' | 'society' | 'commercial';
  readonly groundMount: boolean;
  readonly discomName: string;
  /** The day work started: the onboarding date unless one was recorded (PRD 3.18). */
  readonly startDate: string;
}

/** Ready, missing (which field, captured by which task) or not needed — before any PDF. */
@Injectable()
export class ReportStatusService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly catalog: CatalogService,
    private readonly assets: CompanyAssetsService,
    private readonly formats: ReportFormatsStore,
  ) {}

  async context(projectId: string): Promise<ReportProject> {
    const [project] = await this.db
      .select({
        code: projects.code,
        type: projects.type,
        groundMount: projects.groundMount,
        subsidy: projects.subsidy,
        startDate: projects.startDate,
        discomId: discoms.id,
        discomCode: discoms.code,
        discomName: discoms.name,
      })
      .from(projects)
      .innerJoin(discoms, eq(discoms.id, projects.discomId))
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) throw notFound('That project');
    const rows = await this.db
      .select()
      .from(projectFacts)
      .where(eq(projectFacts.projectId, projectId));
    const tasks = await this.db
      .select({
        templateKey: projectTasks.templateKey,
        title: projectTasks.title,
        status: projectTasks.status,
        captures: projectTasks.captures,
        reports: projectTasks.reports,
        completedAt: projectTasks.completedAt,
      })
      .from(projectTasks)
      .where(eq(projectTasks.projectId, projectId));
    const captureTask = new Map<string, string>();
    for (const task of tasks) for (const key of task.captures) captureTask.set(key, task.title);
    // Installation and commissioning dates come from the day their task was done.
    for (const [fact, templateKey] of Object.entries(TASK_DATE_FACTS)) {
      const task = tasks.find((row) => row.templateKey === templateKey);
      if (task && !captureTask.has(fact)) captureTask.set(fact, task.title);
    }
    return {
      ...project,
      facts: {
        ...taskDateFacts(tasks),
        ...Object.fromEntries(rows.map((row) => [row.key, row.value])),
      },
      captureTask,
      tasks,
    };
  }

  /** One row per project (newest first); the company profile is read once. */
  async overview(): Promise<ReportOverview[]> {
    const rows = await this.db
      .select({
        projectId: projects.id,
        code: projects.code,
        name: customers.name,
        place: properties.city,
        status: projects.status,
      })
      .from(projects)
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .innerJoin(properties, eq(properties.id, projects.propertyId))
      .where(ne(projects.status, 'cancelled'))
      .orderBy(desc(projects.createdAt));
    const company = await this.catalog.company();
    const formats = await this.formats.definitions();
    const result: ReportOverview[] = [];
    for (const row of rows) {
      const context = await this.context(row.projectId);
      result.push({ ...row, reports: projectStatuses(formats, context, company) });
    }
    return result;
  }

  /**
   * Each report's readiness, with its copy in the documents: when saved and handed in,
   * and whether the data behind it changed since (PRD 3.18).
   */
  async statuses(projectId: string): Promise<ReportStatus[]> {
    const project = await this.context(projectId);
    const company = await this.catalog.company();
    const images = await this.assets.dataUris();
    const values = reportValues(project, company, todayIn());
    const filing = await loadFiling(this.db, projectId);
    await this.formats.ensure(project.discomId);
    const formats = await this.formats.definitions();
    return projectReports(formats, project.discomId).map((report) => {
      const status = report.definition
        ? reportStatus(report.definition, project, company)
        : notNeeded(report);
      if (!report.definition || status.status === 'not_needed') return status;
      const print = reportFingerprint(report.definition, values, images);
      return {
        ...status,
        customerVisible: report.definition.customerVisible,
        filing: filingOf(report.key, print, filing),
      };
    });
  }
}
