import { Inject, Injectable } from '@nestjs/common';
import type { QuotationTotals } from '@oneohm/api-contracts';
import { customers, discoms, products, properties, quotations } from '@oneohm/database';
import { eq, inArray } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { CatalogService } from '../catalog/catalog.service';
import { CompanyAssetsService } from '../documents/company-assets.service';
import { planSteps } from '../payment-plans/payment-plans.service';
import { QuotationsService } from '../quotations/quotations.service';
import { PdfRendererService } from './pdf-renderer.service';
import { type ProductLabel, quotationView } from './quotation-document';
import { assetText, brandFontCss, logoDataUri, stampDataUri } from './report-assets';
import { engine } from './report-handlebars';
import type { PdfFile } from './report-pdf.service';

let compiled: ReturnType<typeof engine.compile> | null = null;

interface Snapshot {
  readonly comparison?: { readonly dcr: QuotationTotals; readonly nonDcr: QuotationTotals } | null;
}

/** The quotation as the customer receives it, branded, signed and stamped (PRD 3.5). */
@Injectable()
export class QuotationPdfService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly quotations: QuotationsService,
    private readonly catalog: CatalogService,
    private readonly renderer: PdfRendererService,
    private readonly assets: CompanyAssetsService,
  ) {}

  async render(id: string): Promise<PdfFile> {
    const detail = await this.quotations.get(id);
    const [row] = await this.db
      .select({ snapshot: quotations.snapshot, email: customers.email, property: properties })
      .from(quotations)
      .innerJoin(customers, eq(customers.id, quotations.customerId))
      .innerJoin(properties, eq(properties.id, quotations.propertyId))
      .where(eq(quotations.id, id))
      .limit(1);
    if (!row) throw notFound('That quotation');
    const property = row.property;
    const [discom] = property.discomId
      ? await this.db.select().from(discoms).where(eq(discoms.id, property.discomId)).limit(1)
      : [];
    const ids = [
      detail.input.panelProductId,
      detail.input.inverterProductId,
      ...(detail.input.batteryProductId ? [detail.input.batteryProductId] : []),
    ];
    const rows = await this.db.select().from(products).where(inArray(products.id, ids));
    const label = (productId: string | null | undefined): ProductLabel | null => {
      const product = rows.find((entry) => entry.id === productId);
      if (!product) return null;
      return {
        name:
          product.brand === 'Starter catalog' ? product.name : `${product.brand} ${product.name}`,
        wattageWp: product.wattageWp,
        ratedW: product.ratedW,
        dcr: product.dcr,
        efficiencyBp: product.efficiencyBp,
        technology: product.technology,
        warrantyYears: product.warrantyYears,
      };
    };
    const panel = label(detail.input.panelProductId);
    const inverter = label(detail.input.inverterProductId);
    if (!panel || !inverter) throw notFound('A product on this quotation');

    const images = await this.assets.dataUris();
    const view = quotationView(detail, {
      company: await this.catalog.company(),
      customerEmail: row.email,
      site: {
        address: [property.addressLine, property.city, property.district, property.state]
          .concat(property.pincode ? [property.pincode] : [])
          .filter((part, index, parts) => part.trim() !== '' && part !== parts[index - 1])
          .join(', '),
        discomName: discom ? discom.name : null,
        consumerNumber: property.consumerNumber,
        sanctionedLoadW: property.sanctionedLoadW,
      },
      panel,
      inverter,
      battery: label(detail.input.batteryProductId),
      comparison: (row.snapshot as Snapshot | null)?.comparison ?? null,
      paymentSteps: await planSteps(this.db, null),
      logo: images.logo ?? logoDataUri(),
      stamp: images.signature ?? images.stamp ?? stampDataUri(),
    });

    compiled ??= engine.compile(assetText('quotation', 'quotation.hbs'));
    const style = `<style>${brandFontCss()}\n${assetText('quotation', 'quotation.css')}</style>`;
    const html = compiled(view).replace('</head>', `${style}</head>`);
    const content = await this.renderer.render(html, {
      footer: `${view.company.name} · Quotation ${view.number}`,
    });
    return {
      fileName: `${detail.number}${detail.revision > 1 ? `-R${detail.revision}` : ''}.pdf`,
      content,
    };
  }
}
