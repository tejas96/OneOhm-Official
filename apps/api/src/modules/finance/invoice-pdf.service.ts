import { Inject, Injectable } from '@nestjs/common';
import { customerInvoiceLines, customerInvoices, projects } from '@oneohm/database';
import { asc, eq } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { PdfRendererService } from '../reports/pdf-renderer.service';
import { assetText, brandFontCss, logoDataUri, stampDataUri } from '../reports/report-assets';
import { engine } from '../reports/report-handlebars';
import type { PdfFile } from '../reports/report-pdf.service';
import type { InvoiceParties } from './invoice-parties';
import { invoiceView } from './invoice-view';

let compiled: ReturnType<typeof engine.compile> | null = null;

/**
 * The GST tax invoice as a PDF, in the quotation's and receipt's document style. It is
 * printed from what was fixed when it was issued, never from today's profile or prices.
 */
@Injectable()
export class InvoicePdfService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly renderer: PdfRendererService,
  ) {}

  async render(invoiceId: string): Promise<PdfFile> {
    const [row] = await this.db
      .select({ invoice: customerInvoices, code: projects.code })
      .from(customerInvoices)
      .innerJoin(projects, eq(projects.id, customerInvoices.projectId))
      .where(eq(customerInvoices.id, invoiceId))
      .limit(1);
    if (!row) throw notFound('That invoice');
    const { invoice } = row;
    const lines = await this.db
      .select()
      .from(customerInvoiceLines)
      .where(eq(customerInvoiceLines.invoiceId, invoice.id))
      .orderBy(asc(customerInvoiceLines.position));
    const numberOf = async (id: string | null, field: 'id' | 'replacesInvoiceId') => {
      if (!id) return null;
      const [other] = await this.db
        .select({ number: customerInvoices.number })
        .from(customerInvoices)
        .where(eq(customerInvoices[field], id))
        .limit(1);
      return other?.number ?? null;
    };
    const links = {
      replaces: await numberOf(invoice.replacesInvoiceId, 'id'),
      replacedBy: await numberOf(invoice.id, 'replacesInvoiceId'),
    };
    const view = invoiceView(invoice, lines, row.code, links, {
      logo: logoDataUri(),
      stamp: stampDataUri(),
    });
    compiled ??= engine.compile(assetText('invoice', 'invoice.hbs'));
    const css = [
      brandFontCss(),
      assetText('quotation', 'quotation.css'),
      assetText('receipt', 'receipt.css'),
      assetText('invoice', 'invoice.css'),
    ].join('\n');
    const html = compiled(view).replace('</head>', `<style>${css}</style></head>`);
    const seller = (invoice.parties as InvoiceParties).seller.name;
    const content = await this.renderer.render(html, {
      footer: `${seller} · Tax invoice ${invoice.number}`,
    });
    return { fileName: `${invoice.number.replaceAll('/', '-')}.pdf`, content };
  }
}
