import { Injectable } from '@nestjs/common';
import { todayIn } from '@oneohm/shared';
import type { TemplateDelegate } from 'handlebars';
import { notFound } from '../../common/http/errors';
import { CatalogService } from '../catalog/catalog.service';
import { type AssetImages, CompanyAssetsService } from '../documents/company-assets.service';
import { PdfRendererService } from './pdf-renderer.service';
import { assetText, formFontCss, stampDataUri } from './report-assets';
import type { ReportDefinition } from './report-definitions';
import { ReportFormatsStore } from './report-formats.store';
import { engine, withFillLines } from './report-handlebars';
import { assertReportReady, notNeeded, reportStatus } from './report-readiness';
import { ReportStatusService } from './report-status.service';
import { reportValues } from './report-values';

export interface PdfFile {
  readonly fileName: string;
  readonly content: Buffer;
}

const compiled = new Map<string, TemplateDelegate>();

/** The compiled template, kept until the stored format changes. */
function template(definition: ReportDefinition): TemplateDelegate {
  const cacheKey = `${definition.key}:${definition.version}:${definition.body.length}`;
  let render = compiled.get(cacheKey);
  if (!render) {
    render = engine.compile(definition.body);
    compiled.set(cacheKey, render);
  }
  return render;
}

/** Adds OneOhm's print base and fonts ahead of the template's own styles. */
function withPrintBase(html: string): string {
  const base = `<style>${formFontCss()}\n${assetText('reports', 'report-base.css')}</style>`;
  return html.includes('<head>') ? html.replace('<head>', `<head>${base}`) : `${base}${html}`;
}

/**
 * A format filled with these values, as the printer gets it: every name it reads has a
 * value or a hand-fill line, and the signature and seal are the company's (Settings →
 * Company) or the bundled seal.
 */
export function reportHtml(
  definition: ReportDefinition,
  values: Readonly<Record<string, string>>,
  images: Pick<AssetImages, 'signature' | 'stamp'>,
): string {
  const data = {
    ...withFillLines(definition.body, values),
    __signature: images.signature ?? images.stamp ?? stampDataUri(),
    __stamp: images.stamp ?? images.signature ?? stampDataUri(),
  };
  return withPrintBase(template(definition)(data));
}

/**
 * A statutory report for one project, in its DISCOM's format (Settings → DISCOMs), filled
 * from captured facts and the company profile, signed and stamped. Refuses (409, with
 * what is missing) until it is ready.
 */
@Injectable()
export class ReportPdfService {
  constructor(
    private readonly statuses: ReportStatusService,
    private readonly catalog: CatalogService,
    private readonly renderer: PdfRendererService,
    private readonly assets: CompanyAssetsService,
    private readonly formats: ReportFormatsStore,
  ) {}

  async render(projectId: string, key: string): Promise<PdfFile> {
    const project = await this.statuses.context(projectId);
    const definition = await this.formats.definition(project.discomId, key);
    if (!definition) {
      const known = (await this.formats.definitions()).find((format) => format.key === key);
      if (!known) throw notFound('That report');
      // Another DISCOM's report: refused as not needed for this project.
      assertReportReady(notNeeded(known));
      throw notFound('That report');
    }
    const company = await this.catalog.company();
    assertReportReady(reportStatus(definition, project, company));
    const images = await this.assets.dataUris();
    const html = reportHtml(definition, reportValues(project, company, todayIn()), images);
    const content = await this.renderer.render(html, {
      footer: `${project.code} · ${definition.name}`,
    });
    return { fileName: `${project.code}-${key}.pdf`, content };
  }

  /** A saved format printed with sample details, for checking it in Settings. */
  async sample(definition: ReportDefinition, values: Readonly<Record<string, string>>) {
    const images = await this.assets.dataUris();
    const content = await this.renderer.render(reportHtml(definition, values, images), {
      footer: `Sample · ${definition.name}`,
    });
    return { fileName: `sample-${definition.key}.pdf`, content };
  }
}
