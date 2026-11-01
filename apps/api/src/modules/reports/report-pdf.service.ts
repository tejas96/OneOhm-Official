import { Injectable } from '@nestjs/common';
import type { ReportKey } from '@oneohm/api-contracts';
import { todayIn } from '@oneohm/shared';
import type { TemplateDelegate } from 'handlebars';
import { notFound } from '../../common/http/errors';
import { CatalogService } from '../catalog/catalog.service';
import { PdfRendererService } from './pdf-renderer.service';
import { assetText, formFontCss, stampDataUri } from './report-assets';
import { REPORT_DEFINITIONS } from './report-definitions';
import { engine, withFillLines } from './report-handlebars';
import { assertReportReady, reportStatus } from './report-readiness';
import { ReportStatusService } from './report-status.service';
import { reportValues } from './report-values';

export interface PdfFile {
  readonly fileName: string;
  readonly content: Buffer;
}

const compiled = new Map<ReportKey, { source: string; render: TemplateDelegate }>();

function template(key: ReportKey) {
  let entry = compiled.get(key);
  if (!entry) {
    const source = assetText('reports', 'templates', `${key}.hbs`);
    entry = { source, render: engine.compile(source) };
    compiled.set(key, entry);
  }
  return entry;
}

/** Adds OneOhm's print base and fonts ahead of the template's own styles. */
function withPrintBase(html: string): string {
  const base = `<style>${formFontCss()}\n${assetText('reports', 'report-base.css')}</style>`;
  return html.includes('<head>') ? html.replace('<head>', `<head>${base}`) : `${base}${html}`;
}

/**
 * A statutory report for one project, filled from captured facts and the company
 * profile, signed and stamped. Refuses (409, with what is missing) until it is ready.
 */
@Injectable()
export class ReportPdfService {
  constructor(
    private readonly statuses: ReportStatusService,
    private readonly catalog: CatalogService,
    private readonly renderer: PdfRendererService,
  ) {}

  async render(projectId: string, key: ReportKey): Promise<PdfFile> {
    const definition = REPORT_DEFINITIONS.find((entry) => entry.key === key);
    if (!definition) throw notFound('That report');
    const project = await this.statuses.context(projectId);
    const company = await this.catalog.company();
    assertReportReady(reportStatus(definition, project, company));

    const { source, render } = template(key);
    const data = {
      ...withFillLines(source, reportValues(project, company, todayIn())),
      __stamp: stampDataUri(),
    };
    const html = withPrintBase(render(data));
    const content = await this.renderer.render(html, {
      footer: `${project.code} · ${definition.name}`,
    });
    return { fileName: `${project.code}-${key}.pdf`, content };
  }
}
