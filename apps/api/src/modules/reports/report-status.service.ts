import { Inject, Injectable } from '@nestjs/common';
import type { ReportStatus } from '@oneohm/api-contracts';
import { discoms, projectFacts, projects, projectTasks } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { CatalogService } from '../catalog/catalog.service';
import { REPORT_DEFINITIONS } from './report-definitions';
import { type ReportContext, reportStatus } from './report-readiness';

export type { ReportContext } from './report-readiness';

/** The project details a printed report needs beyond its facts. */
export interface ReportProject extends ReportContext {
  readonly code: string;
  readonly type: 'residential' | 'society' | 'commercial';
  readonly groundMount: boolean;
  readonly discomName: string;
}

/** Ready, missing (which field, captured by which task) or not needed — before any PDF. */
@Injectable()
export class ReportStatusService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly catalog: CatalogService,
  ) {}

  async context(projectId: string): Promise<ReportProject> {
    const [project] = await this.db
      .select({
        code: projects.code,
        type: projects.type,
        groundMount: projects.groundMount,
        subsidy: projects.subsidy,
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
      .select({ title: projectTasks.title, captures: projectTasks.captures })
      .from(projectTasks)
      .where(eq(projectTasks.projectId, projectId));
    const captureTask = new Map<string, string>();
    for (const task of tasks) for (const key of task.captures) captureTask.set(key, task.title);
    return {
      ...project,
      facts: Object.fromEntries(rows.map((row) => [row.key, row.value])),
      captureTask,
    };
  }

  async statuses(projectId: string): Promise<ReportStatus[]> {
    const context = await this.context(projectId);
    const company = await this.catalog.company();
    return REPORT_DEFINITIONS.map((definition) => reportStatus(definition, context, company));
  }
}
