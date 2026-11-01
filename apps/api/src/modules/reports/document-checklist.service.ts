import { Inject, Injectable } from '@nestjs/common';
import type { ChecklistItem, DocumentChecklist } from '@oneohm/api-contracts';
import { customers, discoms, documentRequests, documents, projects } from '@oneohm/database';
import { customerCategoryFor, requirementsFor } from '@oneohm/domain';
import { and, eq, isNull, or } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { loadRequirements } from './document-requirements.service';
import { ReportSettingsService } from './report-settings.service';
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
    private readonly settings: ReportSettingsService,
  ) {}

  async checklist(
    projectId: string,
  ): Promise<DocumentChecklist & { code: string; customer: string }> {
    const [project] = await this.db
      .select({ project: projects, customer: customers.name, discomCode: discoms.code })
      .from(projects)
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .leftJoin(discoms, eq(discoms.id, projects.discomId))
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
    const asked = await this.openRequests(project.project.customerId);
    const shared = await this.settings.customerVisible();
    const needed = requirementsFor(await loadRequirements(this.db), {
      ...project.project,
      discomCode: project.discomCode,
    });
    const papers: ChecklistItem[] = needed.map((requirement) => {
      const ids = files
        .filter(
          (file) =>
            (requirement.categories as readonly string[]).includes(file.category) &&
            !file.reportKey,
        )
        .map((file) => file.id);
      const askCategory = ids.length > 0 ? null : customerCategoryFor(requirement);
      return {
        key: requirement.key,
        label: requirement.label,
        why: requirement.why,
        kind: 'paper',
        status: ids.length > 0 ? 'present' : 'missing',
        documentIds: ids,
        missing: [],
        askCategory,
        requested: askCategory !== null && asked.has(askCategory),
      };
    });
    const statuses = await this.statuses.statuses(projectId);
    const reports: ChecklistItem[] = statuses
      .filter((status) => status.status !== 'not_needed')
      .map((status) => {
        const ids = files.filter((file) => file.reportKey === status.key).map((file) => file.id);
        return {
          key: `report_${status.key}`,
          label: status.name,
          why: shared.has(status.key)
            ? 'Statutory report, shared with the customer.'
            : 'Statutory report.',
          kind: 'report',
          status:
            ids.length > 0 ? 'present' : status.status === 'ready' ? 'ready_to_save' : 'not_ready',
          documentIds: ids,
          missing: status.missing.map((field) =>
            field.taskTitle ? `${field.label} (${field.taskTitle})` : field.label,
          ),
          askCategory: null,
          requested: false,
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

  /** Categories the customer has been asked for and not yet sent. */
  private async openRequests(customerId: string): Promise<ReadonlySet<string>> {
    const rows = await this.db
      .select({ category: documentRequests.category })
      .from(documentRequests)
      .where(and(eq(documentRequests.customerId, customerId), eq(documentRequests.status, 'open')));
    return new Set(rows.map((row) => row.category));
  }
}
