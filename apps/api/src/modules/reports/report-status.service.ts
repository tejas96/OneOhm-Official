import { Inject, Injectable } from '@nestjs/common';
import type { ReportStatus } from '@oneohm/api-contracts';
import { discoms, projectFacts, projects, projectTasks } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { CatalogService } from '../catalog/catalog.service';
import { factLabel } from '../projects/fact-labels';
import {
  COMPANY_FIELD_LABELS,
  REPORT_DEFINITIONS,
  type ReportDefinition,
} from './report-definitions';

export interface ReportContext {
  readonly facts: Readonly<Record<string, string>>;
  readonly subsidy: boolean;
  readonly discomCode: string;
  readonly captureTask: ReadonlyMap<string, string>;
}

/** Ready, missing (which field, captured by which task) or not needed — before any PDF. */
@Injectable()
export class ReportStatusService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly catalog: CatalogService,
  ) {}

  async context(projectId: string): Promise<ReportContext> {
    const [project] = await this.db
      .select({ subsidy: projects.subsidy, discomCode: discoms.code })
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
      facts: Object.fromEntries(rows.map((row) => [row.key, row.value])),
      subsidy: project.subsidy,
      discomCode: project.discomCode,
      captureTask,
    };
  }

  async statuses(projectId: string): Promise<ReportStatus[]> {
    const context = await this.context(projectId);
    const company = await this.catalog.company();
    return REPORT_DEFINITIONS.map((definition) => this.status(definition, context, company));
  }

  status(
    definition: ReportDefinition,
    context: ReportContext,
    company: Record<string, unknown>,
  ): ReportStatus {
    const base = { key: definition.key, name: definition.name };
    if (
      (definition.onlyWithSubsidy && !context.subsidy) ||
      (definition.discomCodes && !definition.discomCodes.includes(context.discomCode))
    ) {
      return { ...base, status: 'not_needed', missing: [] };
    }
    const missing = [
      ...definition.required
        .filter((key) => !context.facts[key]?.trim())
        .map((key) => ({
          field: key,
          label: factLabel(key),
          taskTitle: context.captureTask.get(key) ?? null,
        })),
      ...(definition.company ?? [])
        .filter((field) => typeof company[field] !== 'string' || !(company[field] as string).trim())
        .map((field) => ({ field, label: COMPANY_FIELD_LABELS[field], taskTitle: null })),
    ];
    return { ...base, status: missing.length ? 'missing' : 'ready', missing };
  }
}
