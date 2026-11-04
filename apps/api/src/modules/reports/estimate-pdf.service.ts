import { Inject, Injectable } from '@nestjs/common';
import { leadEstimates, leads } from '@oneohm/database';
import { formatInr, formatKwp, formatWp } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { CatalogService } from '../catalog/catalog.service';
import { CompanyAssetsService } from '../documents/company-assets.service';
import { PdfRendererService } from './pdf-renderer.service';
import { assetText, brandFontCss, logoDataUri } from './report-assets';
import { engine } from './report-handlebars';
import type { PdfFile } from './report-pdf.service';

let compiled: ReturnType<typeof engine.compile> | null = null;

/** How long the estimate's price holds, as the PDF says. */
const VALID_DAYS = 15;
const DAY_MS = 86_400_000;

const longDate = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

const SITE: Record<string, string> = { home: 'Home', business: 'Shop or business' };

/** What was priced, kept on the estimate so the PDF always shows what was sent. */
export interface EstimateSnapshot {
  readonly assumptions: { readonly tariffPaisePerUnit: number; readonly unitsPerKwMonth: number };
}

/**
 * The instant estimate the WhatsApp bot sends a lead, as a one-page PDF with the company
 * header of the quotation. It is clearly an estimate: never a quotation, never a record.
 */
@Injectable()
export class EstimatePdfService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly catalog: CatalogService,
    private readonly renderer: PdfRendererService,
    private readonly assets: CompanyAssetsService,
  ) {}

  /** The estimate, only when it belongs to this lead. */
  async render(leadId: string, estimateId: string): Promise<PdfFile> {
    const [row] = await this.db
      .select({ estimate: leadEstimates, name: leads.name, city: leads.city })
      .from(leadEstimates)
      .innerJoin(leads, eq(leads.id, leadEstimates.leadId))
      .where(and(eq(leadEstimates.id, estimateId), eq(leadEstimates.leadId, leadId)))
      .limit(1);
    if (!row) throw notFound('That estimate');
    const { estimate } = row;
    const capacityWp = estimate.capacityWp ?? 0;
    const modules = estimate.moduleCount ?? 0;
    const { assumptions } = estimate.priced as EstimateSnapshot;
    const site = (estimate.answers as { site?: string }).site ?? '';
    const company = await this.catalog.company();
    const images = await this.assets.dataUris();
    const view = {
      logo: images.logo ?? logoDataUri(),
      company: {
        name: company.legalName,
        brand: company.brandName,
        address: company.shortAddress,
        gstin: company.gstin,
        email: company.email,
        phones: company.phones.join(' · '),
      },
      date: longDate.format(estimate.createdAt),
      validUntil: longDate.format(new Date(estimate.createdAt.getTime() + VALID_DAYS * DAY_MS)),
      customer: { name: row.name, city: row.city, site: SITE[site] ?? site },
      system: {
        size: formatKwp(capacityWp),
        modules:
          modules > 0
            ? `${modules} solar panels of ${formatWp(capacityWp / modules)}`
            : 'Solar panels',
      },
      money: {
        total: formatInr(estimate.totalPaise ?? 0),
        subsidy: formatInr(estimate.subsidyPaise ?? 0),
        effective: formatInr(estimate.effectivePaise ?? 0),
      },
      saving: {
        // Never more than the customer's bill band, so it reads "up to" (live review C2).
        monthly: `Up to ${formatInr(Math.round((estimate.monthlySavingPaise ?? 0) / 100) * 100)}`,
        payback: estimate.paybackYears ? `About ${estimate.paybackYears} years` : '—',
        units: assumptions.unitsPerKwMonth,
        tariff: formatInr(assumptions.tariffPaisePerUnit),
      },
    };
    compiled ??= engine.compile(assetText('estimate', 'estimate.hbs'));
    const css = `${assetText('quotation', 'quotation.css')}\n${assetText('estimate', 'estimate.css')}`;
    const html = compiled(view).replace(
      '</head>',
      `<style>${brandFontCss()}\n${css}</style></head>`,
    );
    const content = await this.renderer.render(html, { footer: `${company.legalName} · Estimate` });
    return { fileName: 'Solar-estimate.pdf', content };
  }
}
