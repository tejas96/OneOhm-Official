import { Inject, Injectable } from '@nestjs/common';
import {
  customers,
  paymentMilestones,
  payments,
  projects,
  properties,
  quotations,
} from '@oneohm/database';
import { amountInWords, formatInr } from '@oneohm/shared';
import { and, eq, sql } from 'drizzle-orm';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { CatalogService } from '../catalog/catalog.service';
import { PdfRendererService } from '../reports/pdf-renderer.service';
import { assetText, brandFontCss, logoDataUri, stampDataUri } from '../reports/report-assets';
import { engine } from '../reports/report-handlebars';
import type { PdfFile } from '../reports/report-pdf.service';
import { receiptNumbers } from './payments-read.service';

const METHOD_LABEL = {
  cash: 'Cash',
  cheque: 'Cheque',
  bank_transfer: 'Bank transfer',
  upi: 'UPI',
  razorpay: 'Online payment',
  bank_disbursement: 'Bank loan disbursement',
} as const;

const longDate = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

let compiled: ReturnType<typeof engine.compile> | null = null;

/** A receipt for every payment received (PRD 3.11), signed and stamped like the quotation. */
@Injectable()
export class ReceiptPdfService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly catalog: CatalogService,
    private readonly renderer: PdfRendererService,
  ) {}

  async render(paymentId: string): Promise<PdfFile> {
    const [row] = await this.db
      .select({
        payment: payments,
        project: projects,
        customer: customers,
        property: properties,
        totalPaise: quotations.totalPaise,
        subsidyPaise: quotations.subsidyPaise,
        milestone: paymentMilestones.label,
      })
      .from(payments)
      .innerJoin(projects, eq(projects.id, payments.projectId))
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .innerJoin(properties, eq(properties.id, projects.propertyId))
      .innerJoin(quotations, eq(quotations.id, projects.quotationId))
      .leftJoin(paymentMilestones, eq(paymentMilestones.id, payments.milestoneId))
      .where(eq(payments.id, paymentId))
      .limit(1);
    if (!row) throw notFound('That payment');
    const { payment, project, customer, property } = row;
    if (payment.reversesPaymentId) throw conflict('A reversal has no receipt of its own.');
    const number = (await receiptNumbers(this.db)).get(payment.id);
    if (!number) throw notFound('A receipt number for that payment');
    // Compared inside PostgreSQL: its timestamps carry microseconds a JS Date would drop.
    const [toDate] = await this.db
      .select({ total: sql<string>`coalesce(sum(${payments.amountPaise}), 0)` })
      .from(payments)
      .where(
        and(
          eq(payments.projectId, project.id),
          sql`${payments.createdAt} <= (select p.created_at from payments p where p.id = ${payment.id})`,
        ),
      );
    const received = Number(toDate?.total ?? 0);
    const [reversal] = await this.db
      .select({ on: payments.receivedOn, reason: payments.reversalReason })
      .from(payments)
      .where(eq(payments.reversesPaymentId, payment.id))
      .limit(1);
    const company = await this.catalog.company();
    const bank = payment.payer === 'bank';

    const view = {
      number,
      date: longDate.format(new Date(`${payment.receivedOn}T12:00:00+05:30`)),
      company: {
        name: company.legalName,
        brand: company.brandName,
        address: company.fullAddress,
        gstin: company.gstin,
        email: company.email,
        phones: company.phones.join(' · '),
        signatory: company.signatoryName,
        designation: company.signatoryDesignation,
      },
      project: { code: project.code },
      customer: { phone: customer.phoneE164 },
      receivedFrom: bank ? (project.lenderName ?? 'Lending bank') : customer.name,
      onBehalfOf: bank ? customer.name : null,
      site: [property.addressLine, property.city, property.district]
        .filter((part) => part && part.trim() !== '')
        .join(', '),
      amount: formatInr(payment.amountPaise),
      amountInWords: amountInWords(payment.amountPaise),
      towards: row.milestone ?? 'Project payment',
      method: METHOD_LABEL[payment.method],
      reference: payment.reference,
      totals: {
        price: formatInr(row.totalPaise),
        received: formatInr(received),
        balance: formatInr(Math.max(0, row.totalPaise - received)),
      },
      subsidyNote:
        row.subsidyPaise > 0
          ? `For information: the expected government subsidy of ${formatInr(row.subsidyPaise)} is paid by the government directly to the customer and is not part of this receipt.`
          : null,
      cancelled: reversal
        ? `Cancelled: this payment was reversed on ${longDate.format(new Date(`${reversal.on}T12:00:00+05:30`))}${reversal.reason ? ` (${reversal.reason})` : ''}.`
        : null,
      logo: logoDataUri(),
      stamp: stampDataUri(),
    };
    compiled ??= engine.compile(assetText('receipt', 'receipt.hbs'));
    const style = `<style>${brandFontCss()}\n${assetText('quotation', 'quotation.css')}\n${assetText('receipt', 'receipt.css')}</style>`;
    const html = compiled(view).replace('</head>', `${style}</head>`);
    const content = await this.renderer.render(html, {
      footer: `${company.legalName} · Receipt ${number}`,
    });
    return { fileName: `${number.replaceAll('/', '-')}.pdf`, content };
  }
}
