import { Inject, Injectable } from '@nestjs/common';
import type { CustomerBilling } from '@oneohm/api-contracts';
import {
  customerInvoices,
  customerRefunds,
  paymentMilestones,
  payments,
  projects,
} from '@oneohm/database';
import { and, asc, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import type { PdfFile } from '../reports/report-pdf.service';
import { creditBalance } from './customer-money-read';
import { InvoicePdfService } from './invoice-pdf.service';
import { ReceiptPdfService } from './receipt-pdf.service';

const REFUND_METHODS = ['cash', 'cheque', 'bank_transfer', 'upi', 'razorpay'] as const;
type RefundMethod = (typeof REFUND_METHODS)[number];
const refundMethod = (method: string): RefundMethod =>
  REFUND_METHODS.find((entry) => entry === method) ?? 'bank_transfer';

/** A customer's own invoices, receipts and refunds (PRD 5.3), and nobody else's. */
@Injectable()
export class CustomerBillingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly invoicePdf: InvoicePdfService,
    private readonly receiptPdf: ReceiptPdfService,
  ) {}

  async billing(customerId: string): Promise<CustomerBilling> {
    const own = await this.projectsOf(customerId);
    if (own.length === 0) return [];
    const ids = own.map((project) => project.id);
    const invoices = await this.db
      .select()
      .from(customerInvoices)
      .where(inArray(customerInvoices.projectId, ids))
      .orderBy(desc(customerInvoices.createdAt));
    const receipts = await this.db
      .select({ payment: payments, label: paymentMilestones.label })
      .from(payments)
      .leftJoin(paymentMilestones, eq(paymentMilestones.id, payments.milestoneId))
      .where(and(inArray(payments.projectId, ids), isNotNull(payments.receiptNumber)))
      .orderBy(desc(payments.createdAt));
    const reversed = await this.db
      .select({ id: payments.reversesPaymentId })
      .from(payments)
      .where(and(inArray(payments.projectId, ids), isNotNull(payments.reversesPaymentId)));
    const refunds = await this.db
      .select()
      .from(customerRefunds)
      .where(inArray(customerRefunds.projectId, ids))
      .orderBy(desc(customerRefunds.createdAt));
    const undone = new Set(reversed.map((row) => row.id));
    const result: CustomerBilling = [];
    for (const project of own) {
      result.push({
        projectId: project.id,
        projectCode: project.code,
        creditPaise: Math.max(0, await creditBalance(this.db, project.id)),
        invoices: invoices
          .filter((invoice) => invoice.projectId === project.id)
          .map((invoice) => ({
            id: invoice.id,
            number: invoice.number,
            invoiceDate: invoice.invoiceDate,
            totalPaise: invoice.totalPaise,
            status: invoice.status,
          })),
        receipts: receipts
          .filter((row) => row.payment.projectId === project.id)
          .map(({ payment, label }) => ({
            id: payment.id,
            number: payment.receiptNumber ?? '',
            receivedOn: payment.receivedOn,
            amountPaise: payment.amountPaise,
            milestoneLabel: label,
            reversed: undone.has(payment.id),
          })),
        refunds: refunds
          .filter((refund) => refund.projectId === project.id)
          .map((refund) => ({
            id: refund.id,
            paidOn: refund.paidOn,
            amountPaise: refund.amountPaise,
            method: refundMethod(refund.method),
          })),
      });
    }
    return result;
  }

  async invoice(customerId: string, invoiceId: string): Promise<PdfFile> {
    const ids = (await this.projectsOf(customerId)).map((project) => project.id);
    const [row] = ids.length
      ? await this.db
          .select({ id: customerInvoices.id })
          .from(customerInvoices)
          .where(and(eq(customerInvoices.id, invoiceId), inArray(customerInvoices.projectId, ids)))
          .limit(1)
      : [];
    if (!row) throw notFound('That invoice');
    return this.invoicePdf.render(row.id);
  }

  async receipt(customerId: string, paymentId: string): Promise<PdfFile> {
    const ids = (await this.projectsOf(customerId)).map((project) => project.id);
    const [row] = ids.length
      ? await this.db
          .select({ id: payments.id })
          .from(payments)
          .where(
            and(
              eq(payments.id, paymentId),
              inArray(payments.projectId, ids),
              isNotNull(payments.receiptNumber),
            ),
          )
          .limit(1)
      : [];
    if (!row) throw notFound('That receipt');
    return this.receiptPdf.render(row.id);
  }

  private projectsOf(customerId: string) {
    return this.db
      .select({ id: projects.id, code: projects.code })
      .from(projects)
      .where(and(eq(projects.customerId, customerId), ne(projects.status, 'cancelled')))
      .orderBy(asc(projects.code));
  }
}
