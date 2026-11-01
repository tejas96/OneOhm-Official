import { Inject, Injectable } from '@nestjs/common';
import type { ReportFormat, ReportFormatCheck, ReportFormatInput } from '@oneohm/api-contracts';
import { discomReportTemplates, discoms, taskTemplates } from '@oneohm/database';
import { factLabel } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { asc, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan } from '../../common/auth/actor';
import { invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { CatalogService } from '../catalog/catalog.service';
import { builtInTemplate, COMPANY_FIELD_LABELS, definitionOf } from './report-definitions';
import { checkReportBody, sampleFacts } from './report-format-check';
import { formatDefinition, ReportFormatsStore } from './report-formats.store';
import { type PdfFile, ReportPdfService, reportHtml } from './report-pdf.service';
import { reportValues } from './report-values';

type FormatRow = typeof discomReportTemplates.$inferSelect;

/** A report key from its name, e.g. "Meter Test Letter (BEST)" → "meter-test-letter-best". */
const keyFromName = (name: string) => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return /^[a-z]/.test(slug) ? slug : `report-${slug}`;
};

/**
 * Settings → DISCOMs → Report formats (PRD 3.18, 7.2): each DISCOM's statutory report
 * templates, uploaded or replaced without a developer. A template is refused when it
 * prints a detail nobody records; what it needs is read from it. Saved copies are made
 * again by themselves once the format changes (unless already submitted).
 */
@Injectable()
export class ReportFormatsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly store: ReportFormatsStore,
    private readonly catalog: CatalogService,
    private readonly pdf: ReportPdfService,
  ) {}

  async list(actor: Actor, discomId: string): Promise<ReportFormat[]> {
    assertCan(actor, 'settings.manage');
    await this.discom(discomId);
    await this.store.ensure(discomId);
    const rows = await this.db
      .select()
      .from(discomReportTemplates)
      .where(eq(discomReportTemplates.discomId, discomId))
      .orderBy(asc(discomReportTemplates.position), asc(discomReportTemplates.createdAt));
    const triggers = await this.triggers();
    return rows.map((row) => this.present(row, triggers));
  }

  async create(actor: Actor, discomId: string, input: ReportFormatInput): Promise<ReportFormat> {
    assertCan(actor, 'settings.manage');
    await this.discom(discomId);
    await this.store.ensure(discomId);
    checkReportBody(input.body);
    const existing = await this.db
      .select({ key: discomReportTemplates.key, position: discomReportTemplates.position })
      .from(discomReportTemplates)
      .where(eq(discomReportTemplates.discomId, discomId));
    const base = keyFromName(input.name);
    let key = base;
    for (let n = 2; existing.some((row) => row.key === key); n += 1) key = `${base}-${n}`;
    const position = Math.max(-1, ...existing.map((row) => row.position)) + 1;
    const [row] = await this.db
      .insert(discomReportTemplates)
      .values({
        discomId,
        key,
        ...input,
        name: input.name.trim(),
        source: input.body === builtInTemplate(key) ? 'built_in' : 'uploaded',
        position,
        updatedByUserId: actor.userId,
      })
      .returning();
    if (!row) throw new Error('Report format insert returned nothing.');
    await recordAudit(this.db, actor.userId, 'report_format.created', 'report_format', row.id, {
      discomId,
      key,
      name: row.name,
    });
    return this.present(row, await this.triggers());
  }

  async update(actor: Actor, id: string, input: ReportFormatInput): Promise<ReportFormat> {
    assertCan(actor, 'settings.manage');
    const current = await this.row(id);
    if (input.body !== current.body) checkReportBody(input.body);
    const [row] = await this.db
      .update(discomReportTemplates)
      .set({
        ...input,
        name: input.name.trim(),
        // Back to OneOhm's own file when the owner restores it; theirs otherwise.
        source: input.body === builtInTemplate(current.key) ? 'built_in' : 'uploaded',
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(discomReportTemplates.id, id))
      .returning();
    if (!row) throw notFound('That report format');
    await recordAudit(this.db, actor.userId, 'report_format.changed', 'report_format', id, {
      key: row.key,
      bodyReplaced: input.body !== current.body,
      before: { name: current.name, active: current.active, visible: current.customerVisible },
      after: { name: row.name, active: row.active, visible: row.customerVisible },
    });
    return this.present(row, await this.triggers());
  }

  async body(actor: Actor, id: string): Promise<{ body: string; builtIn: string | null }> {
    assertCan(actor, 'settings.manage');
    const row = await this.row(id);
    return { body: row.body, builtIn: builtInTemplate(row.key) };
  }

  /** What a body needs, and its print with sample details; refuses a body OneOhm cannot print. */
  async check(actor: Actor, body: string): Promise<ReportFormatCheck> {
    assertCan(actor, 'settings.manage');
    const requires = checkReportBody(body);
    const definition = definitionOf({
      id: '',
      discomId: '',
      key: 'sample',
      name: 'Sample',
      body,
      onlyWithSubsidy: false,
      customerVisible: false,
      version: `check:${body.length}`,
    });
    try {
      const html = reportHtml(definition, await this.sampleValues(body), {
        signature: null,
        stamp: null,
      });
      return { requires, html };
    } catch (error) {
      throw invalid('This template stops part-way when printed.', {
        body: (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '',
      });
    }
  }

  async samplePdf(actor: Actor, id: string): Promise<PdfFile> {
    assertCan(actor, 'settings.manage');
    const definition = formatDefinition(await this.row(id));
    return this.pdf.sample(definition, await this.sampleValues(definition.body));
  }

  private async sampleValues(body: string): Promise<Record<string, string>> {
    const today = todayIn();
    const project = {
      code: 'OH-SAMPLE',
      type: 'residential' as const,
      groundMount: false,
      discomName: 'DISCOM',
      discomCode: 'DISCOM',
      discomId: '',
      startDate: today,
      subsidy: true,
      facts: sampleFacts(body, today),
      captureTask: new Map<string, string>(),
    };
    return reportValues(project, await this.catalog.company(), today);
  }

  /** Report key → titles of the active task templates that make it. */
  private async triggers(): Promise<Map<string, string[]>> {
    const rows = await this.db
      .select({ title: taskTemplates.title, reports: taskTemplates.reports })
      .from(taskTemplates)
      .where(eq(taskTemplates.active, true))
      .orderBy(asc(taskTemplates.position));
    const map = new Map<string, string[]>();
    for (const row of rows)
      for (const key of row.reports) map.set(key, [...(map.get(key) ?? []), row.title]);
    return map;
  }

  private async row(id: string): Promise<FormatRow> {
    const [row] = await this.db
      .select()
      .from(discomReportTemplates)
      .where(eq(discomReportTemplates.id, id));
    if (!row) throw notFound('That report format');
    return row;
  }

  private async discom(id: string) {
    const [row] = await this.db.select({ id: discoms.id }).from(discoms).where(eq(discoms.id, id));
    if (!row) throw notFound('That DISCOM');
  }

  private present(row: FormatRow, triggers: ReadonlyMap<string, string[]>): ReportFormat {
    const definition = formatDefinition(row);
    return {
      id: row.id,
      discomId: row.discomId,
      key: row.key,
      name: row.name,
      onlyWithSubsidy: row.onlyWithSubsidy,
      customerVisible: row.customerVisible,
      active: row.active,
      source: row.source,
      requires: [
        ...definition.required.map((field) => ({ field, label: factLabel(field) })),
        ...(definition.company ?? []).map((field) => ({
          field,
          label: COMPANY_FIELD_LABELS[field],
        })),
      ],
      triggers: triggers.get(row.key) ?? [],
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
