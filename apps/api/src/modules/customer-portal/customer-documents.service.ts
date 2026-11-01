import { Inject, Injectable } from '@nestjs/common';
import type { CustomerDocument, CustomerReport, ReportKey } from '@oneohm/api-contracts';
import { documents, projects, projectTasks } from '@oneohm/database';
import { and, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { ObjectStorageService, type StoredObject } from '../documents/object-storage.service';
import { type PdfFile, ReportPdfService } from '../reports/report-pdf.service';
import { ReportSettingsService } from '../reports/report-settings.service';
import { ReportStatusService } from '../reports/report-status.service';

/**
 * Papers a homeowner should have (PRD 5.4). Internal files (vendor papers, working
 * photos) stay with the team; site photos show only on updates the customer can see.
 */
const CUSTOMER_FACING = new Set([
  'site_survey',
  'customer_kyc',
  'electricity_bill',
  'property',
  'quotation',
  'invoice_receipt',
  'bank_loan',
  'discom',
  'subsidy',
  'commissioning_handover',
  'warranty',
  'statutory_report',
  'other',
]);

@Injectable()
export class CustomerDocumentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: ObjectStorageService,
    private readonly statuses: ReportStatusService,
    private readonly reports: ReportPdfService,
    private readonly settings: ReportSettingsService,
  ) {}

  async list(customerId: string): Promise<CustomerDocument[]> {
    const own = await this.projectsOf(customerId);
    const scope = own.length
      ? or(
          eq(documents.customerId, customerId),
          inArray(
            documents.projectId,
            own.map((project) => project.id),
          ),
        )
      : eq(documents.customerId, customerId);
    const rows = await this.db
      .select({
        id: documents.id,
        name: documents.name,
        category: documents.category,
        projectId: documents.projectId,
        contentType: documents.contentType,
        sizeBytes: documents.sizeBytes,
        createdAt: documents.createdAt,
        visibleTask: projectTasks.customerVisible,
        source: documents.source,
      })
      .from(documents)
      .leftJoin(projectTasks, eq(projectTasks.id, documents.taskId))
      .where(and(scope, isNull(documents.replacedAt), isNull(documents.removedAt)))
      .orderBy(desc(documents.createdAt));
    const code = new Map(own.map((project) => [project.id, project.code]));
    return (
      rows
        // Saved statutory reports have their own Reports section in the app.
        .filter((row) => row.source !== 'report')
        .filter(
          (row) =>
            CUSTOMER_FACING.has(row.category) ||
            // Site photos on updates the customer sees; site videos stay with the team.
            (row.category === 'site_photo' &&
              row.visibleTask === true &&
              row.contentType.startsWith('image/')),
        )
        .map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category,
          projectCode: row.projectId ? (code.get(row.projectId) ?? null) : null,
          contentType: row.contentType,
          sizeBytes: row.sizeBytes,
          createdAt: row.createdAt.toISOString(),
        }))
    );
  }

  /** The stored file, only when it is one of this customer's visible documents. */
  async file(
    customerId: string,
    id: string,
  ): Promise<StoredObject & { name: string; type: string }> {
    const visible = await this.list(customerId);
    if (!visible.some((doc) => doc.id === id)) throw notFound('That document');
    const [row] = await this.db
      .select({ key: documents.storageKey, name: documents.name, type: documents.contentType })
      .from(documents)
      .where(eq(documents.id, id));
    if (!row) throw notFound('That document');
    return { ...(await this.storage.get(row.key)), name: row.name, type: row.type };
  }

  async readyReports(customerId: string): Promise<CustomerReport[]> {
    const result: CustomerReport[] = [];
    const shared = await this.settings.customerVisible();
    for (const project of await this.projectsOf(customerId)) {
      for (const report of await this.statuses.statuses(project.id)) {
        // Only ready reports the owner shares with customers (PRD 3.18).
        if (report.status !== 'ready' || !shared.has(report.key)) continue;
        result.push({
          projectId: project.id,
          projectCode: project.code,
          key: report.key,
          name: report.name,
        });
      }
    }
    return result;
  }

  async reportPdf(customerId: string, projectId: string, key: ReportKey): Promise<PdfFile> {
    const own = await this.projectsOf(customerId);
    if (!own.some((project) => project.id === projectId)) throw notFound('That project');
    if (!(await this.settings.customerVisible()).has(key)) throw notFound('That report');
    return this.reports.render(projectId, key);
  }

  private projectsOf(customerId: string) {
    return this.db
      .select({ id: projects.id, code: projects.code })
      .from(projects)
      .where(and(eq(projects.customerId, customerId), ne(projects.status, 'cancelled')));
  }
}
