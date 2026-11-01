import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { documents } from '@oneohm/database';
import { and, eq, isNull, like } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { CatalogService } from '../catalog/catalog.service';
import { ObjectStorageService } from '../documents/object-storage.service';
import { PdfRendererService } from './pdf-renderer.service';
import type { PdfFile } from './report-pdf.service';
import {
  loadSurveyReport,
  MAX_PHOTOS,
  type SurveyPhoto,
  type SurveyReportData,
} from './survey-report.data';
import { type PrintedPhoto, surveyReportHtml } from './survey-report-html';

const STORAGE_PREFIX = 'surveys';

const time = (date: Date | null) =>
  date
    ? new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date)
    : '';

/** "1 Nov, 11:20 am · 16.85512, 74.58123 · 12 m from the site" */
function caption(photo: SurveyPhoto): string {
  const place =
    photo.latitude !== null && photo.longitude !== null
      ? `${photo.latitude.toFixed(5)}, ${photo.longitude.toFixed(5)}`
      : 'No location';
  const distance = photo.farFromSite
    ? 'far from the site'
    : photo.distanceM !== null
      ? `${photo.distanceM} m from the site`
      : '';
  return [time(photo.takenAt), place, distance].filter(Boolean).join(' · ');
}

/**
 * The site survey report (PRD 3.4): printed on demand while the survey waits for a
 * manager, and filed in the project's documents once approved (again if it changes).
 */
@Injectable()
export class SurveyReportService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly catalog: CatalogService,
    private readonly renderer: PdfRendererService,
    private readonly storage: ObjectStorageService,
  ) {}

  async render(projectId: string): Promise<PdfFile> {
    const data = await loadSurveyReport(this.db, projectId);
    if (!data) throw notFound('A site survey on this project');
    return this.pdf(data);
  }

  /** Files the approved survey's report with the project's documents, when it changed. */
  async fileIfApproved(projectId: string, userId: string | null): Promise<boolean> {
    const data = await loadSurveyReport(this.db, projectId);
    if (data?.task.status !== 'completed') return false;
    const print = createHash('sha256')
      .update(
        JSON.stringify([
          data.facts,
          data.checklist,
          data.photos.map((p) => p.documentId),
          data.task.note,
        ]),
      )
      .digest('hex')
      .slice(0, 16);
    const storageKey = `${STORAGE_PREFIX}/${projectId}/site-survey-${print}.pdf`;
    const [current] = await this.db
      .select({ id: documents.id, storageKey: documents.storageKey })
      .from(documents)
      .where(
        and(
          eq(documents.projectId, projectId),
          eq(documents.source, 'system'),
          like(documents.storageKey, `${STORAGE_PREFIX}/${projectId}/%`),
          isNull(documents.replacedAt),
          isNull(documents.removedAt),
        ),
      )
      .limit(1);
    if (current?.storageKey === storageKey) return false;
    const file = await this.pdf(data);
    await this.storage.put(storageKey, file.content, 'application/pdf');
    await this.db.transaction(async (tx) => {
      if (current)
        await tx
          .update(documents)
          .set({ replacedAt: new Date(), replacedByUserId: userId })
          .where(eq(documents.id, current.id));
      await tx.insert(documents).values({
        projectId,
        customerId: data.customerId,
        propertyId: data.propertyId,
        category: 'site_survey',
        source: 'system',
        name: `Site survey report · ${data.code}.pdf`,
        storageKey,
        contentType: 'application/pdf',
        sizeBytes: file.content.length,
        replacesDocumentId: current?.id ?? null,
        uploadedByUserId: userId,
      });
    });
    return true;
  }

  private async pdf(data: SurveyReportData): Promise<PdfFile> {
    const company = await this.catalog.company();
    const photos: PrintedPhoto[] = [];
    for (const photo of data.photos.slice(0, MAX_PHOTOS)) {
      const bytes = await this.storage.getBuffer(photo.storageKey).catch(() => null);
      if (bytes)
        photos.push({
          dataUri: `data:${photo.contentType};base64,${bytes.toString('base64')}`,
          caption: caption(photo),
        });
    }
    const date = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date());
    const html = surveyReportHtml({ company: company.brandName, data, photos, date });
    const content = await this.renderer.render(html, {
      footer: `${data.code} · Site survey report`,
    });
    return { fileName: `${data.code}-site-survey.pdf`, content };
  }
}
