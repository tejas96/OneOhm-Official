import { Inject, Injectable } from '@nestjs/common';
import { bankPayouts, payables } from '@oneohm/database';
import { amountInWords, formatInr } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { CatalogService } from '../catalog/catalog.service';
import { pdfFileName } from '../reports/pdf-file-name';
import { PdfRendererService } from '../reports/pdf-renderer.service';
import { brandFontCss, logoDataUri } from '../reports/report-assets';
import type { PdfFile } from '../reports/report-pdf.service';
import { payeeOf } from './payees';
import { adviceHtml, adviceStyles } from './payout-advice-html';

const longDate = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

/** The OneOhm reference people quote on the phone: the start of the payout's id. */
export const payoutReference = (id: string): string => `PAY-${id.slice(0, 8).toUpperCase()}`;

/** A payment advice for a bank transfer the bank has confirmed (PRD 3.11). */
@Injectable()
export class PayoutAdviceService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly catalog: CatalogService,
    private readonly renderer: PdfRendererService,
  ) {}

  async render(payoutId: string): Promise<PdfFile> {
    const [row] = await this.db
      .select({ payout: bankPayouts, bill: payables })
      .from(bankPayouts)
      .innerJoin(payables, eq(payables.id, bankPayouts.payableId))
      .where(eq(bankPayouts.id, payoutId))
      .limit(1);
    if (!row) throw notFound('That payout');
    const { payout, bill } = row;
    if (payout.status !== 'processed') {
      throw conflict('A payment advice is ready once the bank has paid.', 'payout_not_paid');
    }
    const [company, payee] = await Promise.all([this.catalog.company(), payeeOf(this.db, bill.id)]);
    const reference = payoutReference(payout.id);
    const day = payout.paidOn ?? payout.updatedAt.toISOString().slice(0, 10);
    const view = {
      reference,
      date: longDate.format(new Date(`${day}T12:00:00+05:30`)),
      company: {
        name: company.legalName,
        brand: company.brandName,
        address: company.fullAddress,
        gstin: company.gstin,
        email: company.email,
        phones: company.phones.join(' · '),
      },
      payee: bill.partyName,
      last4: payout.accountMasked.replace(/\D/g, '').slice(-4) || payout.accountMasked.slice(-4),
      ifsc: payee?.bank.ifsc ?? null,
      towards: [bill.billNumber ? `Bill ${bill.billNumber}` : null, bill.description]
        .filter(Boolean)
        .join(' · '),
      amount: formatInr(payout.amountPaise),
      amountInWords: amountInWords(payout.amountPaise),
      utr: payout.utr ?? '—',
      mode: payout.mode.toUpperCase(),
      tds: bill.tdsPaise > 0 ? formatInr(bill.tdsPaise) : null,
      logo: logoDataUri(),
    };
    const html = adviceHtml(view).replace('</head>', `${adviceStyles(brandFontCss())}</head>`);
    const content = await this.renderer.render(html, {
      footer: `${company.legalName} · Payment advice ${reference}`,
    });
    return { fileName: pdfFileName(`Payment-advice-${reference}`), content };
  }
}
