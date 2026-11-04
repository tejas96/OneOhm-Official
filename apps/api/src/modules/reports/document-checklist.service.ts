import { Inject, Injectable } from '@nestjs/common';
import type { ChecklistItem, DocumentChecklist } from '@oneohm/api-contracts';
import { customerActions, customers, discoms, documents, projects } from '@oneohm/database';
import {
  countsForSite,
  customerCategoryFor,
  requirementsFor,
  type SiteScope,
  sameAsk,
} from '@oneohm/domain';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { customerHomes } from '../customer-portal/customer-homes';
import { fileSystemPapers } from '../documents/system-papers-hook';
import { loadRequirements } from './document-requirements.service';
import { ReportStatusService } from './report-status.service';

/**
 * Which papers and reports a project needs and which it has (PRD 3.14, 3.18). ID papers
 * count wherever they were filed for the customer; a bill or property proof counts only
 * for its own site, so a customer with two sites cannot lend one site's papers to the other.
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
    // The accepted quotation, invoices and receipts count once they are printed and filed.
    await fileSystemPapers({ projectId });
    const [project] = await this.db
      .select({ project: projects, customer: customers.name, discomCode: discoms.code })
      .from(projects)
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .leftJoin(discoms, eq(discoms.id, projects.discomId))
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) throw notFound('That project');
    const homes = await customerHomes(this.db, project.project.customerId);
    const site: SiteScope = {
      propertyId: project.project.propertyId,
      projectId,
      customerSites: homes.length || 1,
    };
    const filed = await this.db
      .select({
        id: documents.id,
        category: documents.category,
        reportKey: documents.reportKey,
        propertyId: documents.propertyId,
        projectId: documents.projectId,
        checkedAt: documents.checkedAt,
        serviceRequestId: documents.serviceRequestId,
      })
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
    const files = filed.filter((file) => countsForSite(file, site));
    const asked = await this.requests(project.project.customerId, site);
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
      // Only a paper the customer holds waits for the team's look; a photo on a problem or a
      // site photo from a chat is not the customer's answer to this row.
      const unchecked = requirement.fromCustomer
        ? files.filter((file) => ids.includes(file.id) && !file.checkedAt && !file.serviceRequestId)
        : [];
      const waiting = asked.received.find((one) => one.documentId && ids.includes(one.documentId));
      return {
        key: requirement.key,
        label: requirement.label,
        why: requirement.why,
        kind: 'paper',
        status: ids.length > 0 ? 'present' : 'missing',
        documentIds: ids,
        check: ids.length === 0 ? 'missing' : unchecked.length > 0 ? 'to_check' : 'checked',
        actionId: unchecked.length > 0 ? (waiting?.id ?? null) : null,
        missing: [],
        askCategory,
        requested:
          askCategory !== null &&
          // Any open ask of this kind on this home (or for this person) covers the row.
          asked.open.some(
            (one) =>
              one.category === askCategory ||
              sameAsk(
                { requirementKey: requirement.key, category: askCategory },
                { requirementKey: one.requirementKey, category: one.category },
              ),
          ),
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
          why: status.customerVisible
            ? 'Statutory report, shared with the customer.'
            : 'Statutory report.',
          kind: 'report',
          // A copy made before the report was complete does not count; a submitted one does.
          status:
            status.filing?.submittedAt || (ids.length > 0 && status.status === 'ready')
              ? 'present'
              : status.status === 'ready'
                ? 'ready_to_save'
                : 'not_ready',
          documentIds: ids,
          missing: [
            ...status.missing.map((field) =>
              field.taskTitle ? `${field.label} (${field.taskTitle})` : field.label,
            ),
            // Made only once the task it certifies is done (PRD 3.18 triggers).
            ...(status.waitingFor ? [`“${status.waitingFor}” to be done`] : []),
          ],
          check: null,
          actionId: null,
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

  /** This home's paper requests: still open, and received (waiting for the team's check). */
  private async requests(customerId: string, site: SiteScope) {
    const rows = await this.db
      .select({
        id: customerActions.id,
        category: customerActions.category,
        requirementKey: customerActions.requirementKey,
        status: customerActions.status,
        documentId: customerActions.documentId,
        projectId: customerActions.projectId,
        propertyId: customerActions.propertyId,
      })
      .from(customerActions)
      .where(
        and(
          eq(customerActions.customerId, customerId),
          eq(customerActions.type, 'paper'),
          inArray(customerActions.status, ['open', 'received']),
        ),
      );
    const here = rows
      .filter((row) => row.category && countsForSite({ ...row, category: row.category }, site))
      .map((row) => ({ ...row, category: row.category as string }));
    return {
      open: here.filter((row) => row.status === 'open'),
      received: here.filter((row) => row.status === 'received'),
    };
  }
}
