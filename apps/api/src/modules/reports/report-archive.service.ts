import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { documents, projects } from '@oneohm/database';
import { and, eq, isNull } from 'drizzle-orm';
import { DATABASE, type Database } from '../../config/core.module';
import { CatalogService } from '../catalog/catalog.service';
import { ObjectStorageService } from '../documents/object-storage.service';
import { REPORT_DEFINITIONS } from './report-definitions';
import { ReportPdfService } from './report-pdf.service';
import { reportStatus } from './report-readiness';
import { ReportStatusService } from './report-status.service';

const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

/**
 * Keeps every ready statutory report saved in the project's documents (PRD 3.18):
 * saved once ready, saved again when the data behind it changes, with the earlier copy
 * kept in the audit trail. The data's fingerprint is part of the stored file's key.
 */
@Injectable()
export class ReportArchiveService {
  private readonly log = new Logger('Reports');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly statuses: ReportStatusService,
    private readonly catalog: CatalogService,
    private readonly pdf: ReportPdfService,
    private readonly storage: ObjectStorageService,
  ) {}

  async refresh(
    projectId: string,
    userId: string | null,
  ): Promise<{ saved: number; unchanged: number }> {
    const context = await this.statuses.context(projectId);
    const company = await this.catalog.company();
    const [project] = await this.db
      .select({ customerId: projects.customerId, propertyId: projects.propertyId })
      .from(projects)
      .where(eq(projects.id, projectId));
    const current = await this.db
      .select({
        id: documents.id,
        reportKey: documents.reportKey,
        storageKey: documents.storageKey,
      })
      .from(documents)
      .where(
        and(
          eq(documents.projectId, projectId),
          eq(documents.source, 'report'),
          isNull(documents.replacedAt),
          isNull(documents.removedAt),
        ),
      );
    const base = {
      facts: Object.entries(context.facts).sort(([a], [b]) => a.localeCompare(b)),
      subsidy: context.subsidy,
      discom: context.discomCode,
      company: [company.legalName, company.gstin, company.signatoryName, company.signatoryPhone],
    };
    let saved = 0;
    let unchanged = 0;
    for (const definition of REPORT_DEFINITIONS) {
      if (reportStatus(definition, context, company).status !== 'ready') continue;
      const print = fingerprint({ key: definition.key, ...base });
      const existing = current.find((row) => row.reportKey === definition.key);
      if (existing?.storageKey.endsWith(`-${print}.pdf`)) {
        unchanged += 1;
        continue;
      }
      const file = await this.pdf.render(projectId, definition.key);
      const storageKey = `reports/${projectId}/${definition.key}-${print}.pdf`;
      await this.storage.put(storageKey, file.content, 'application/pdf');
      await this.db.transaction(async (tx) => {
        if (existing)
          await tx
            .update(documents)
            .set({ replacedAt: new Date(), replacedByUserId: userId })
            .where(eq(documents.id, existing.id));
        await tx.insert(documents).values({
          projectId,
          customerId: project?.customerId ?? null,
          propertyId: project?.propertyId ?? null,
          category: 'statutory_report',
          source: 'report',
          name: `${definition.name} · ${context.code}.pdf`,
          storageKey,
          contentType: 'application/pdf',
          sizeBytes: file.content.length,
          reportKey: definition.key,
          replacesDocumentId: existing?.id ?? null,
          uploadedByUserId: userId,
        });
      });
      saved += 1;
    }
    return { saved, unchanged };
  }

  /** The same, after work changes the project; a failure is logged and never undoes the work. */
  refreshLater(projectId: string, userId: string | null): void {
    void this.refresh(projectId, userId).catch((error: unknown) =>
      this.log.error(`Saving reports for ${projectId} failed: ${String(error)}`),
    );
  }
}
