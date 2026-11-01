import { Inject, Injectable } from '@nestjs/common';
import type { ChecklistItem, DocumentChecklist } from '@oneohm/api-contracts';
import { customers, documents, projects } from '@oneohm/database';
import { requiredDocuments } from '@oneohm/domain';
import { and, eq, isNull, or } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { REPORT_DEFINITIONS } from './report-definitions';
import { ReportStatusService } from './report-status.service';

/**
 * Which papers and reports a project needs and which it has (PRD 3.14, 3.18). Customer
 * papers (ID, bill, property) count wherever they were filed for that customer.
 */
@Injectable()
export class DocumentChecklistService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly statuses: ReportStatusService,
  ) {}

  async checklist(
    projectId: string,
  ): Promise<DocumentChecklist & { code: string; customer: string }> {
    const [project] = await this.db
      .select({ project: projects, customer: customers.name })
      .from(projects)
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) throw notFound('That project');
    const files = await this.db
      .select({ id: documents.id, category: documents.category, reportKey: documents.reportKey })
      .from(documents)
      .where(
        and(
          or(
            eq(documents.projectId, projectId),
            eq(documents.customerId, project.project.customerId),
          ),
          isNull(documents.replacedAt),
          isNull(documents.removedAt),
        ),
      );
    const papers: ChecklistItem[] = requiredDocuments(project.project).map((requirement) => {
      const ids = files
        .filter(
          (file) =>
            (requirement.categories as readonly string[]).includes(file.category) &&
            !file.reportKey,
        )
        .map((file) => file.id);
      return {
        key: requirement.key,
        label: requirement.label,
        why: requirement.why,
        kind: 'paper',
        status: ids.length > 0 ? 'present' : 'missing',
        documentIds: ids,
        missing: [],
      };
    });
    const statuses = await this.statuses.statuses(projectId);
    const reports: ChecklistItem[] = statuses
      .filter((status) => status.status !== 'not_needed')
      .map((status) => {
        const ids = files.filter((file) => file.reportKey === status.key).map((file) => file.id);
        const definition = REPORT_DEFINITIONS.find((entry) => entry.key === status.key);
        return {
          key: `report_${status.key}`,
          label: status.name,
          why: definition?.customerVisible
            ? 'Statutory report, shared with the customer.'
            : 'Statutory report.',
          kind: 'report',
          status:
            ids.length > 0 ? 'present' : status.status === 'ready' ? 'ready_to_save' : 'not_ready',
          documentIds: ids,
          missing: status.missing.map((field) =>
            field.taskTitle ? `${field.label} (${field.taskTitle})` : field.label,
          ),
        };
      });
    const items = [...papers, ...reports];
    return {
      items,
      present: items.filter((item) => item.status === 'present').length,
      total: items.length,
      code: project.project.code,
      customer: project.customer,
    };
  }
}
