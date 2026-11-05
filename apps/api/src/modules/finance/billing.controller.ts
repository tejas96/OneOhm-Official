import { Controller, Inject } from '@nestjs/common';
import type { ProjectBilling } from '@oneohm/api-contracts';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { DATABASE, type Database } from '../../config/core.module';
import { apiContract } from '../../contract';
import { pdfBody } from '../reports/reports.controller';
import { CustomerMoneyService } from './customer-money.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { invoiceDraft, loadInvoiceSource } from './invoice-source';
import { InvoicesService } from './invoices.service';

/** Tax invoices, customer credit and refunds for finance (PRD 3.11). */
@Controller()
export class BillingController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly invoices: InvoicesService,
    private readonly invoicePdf: InvoicePdfService,
    private readonly money: CustomerMoneyService,
  ) {}

  @TsRestHandler(apiContract.billing)
  handler(@CurrentActor() actor: Actor) {
    const view = () => assertCan(actor, 'finance.view', 'finance.record_payments');
    const record = () => assertCan(actor, 'finance.record_payments');
    // Money going back out, or a tax invoice undone, is a sensitive action (PRD 7.3).
    const approve = () => assertCan(actor, 'finance.approve_payments');
    return tsRestHandler(apiContract.billing, {
      projectBilling: async ({ params }) => {
        view();
        return { status: 200, body: await this.projectBilling(params.projectId) };
      },
      issueInvoice: async ({ params, body }) => {
        record();
        const invoice = await this.invoices.issue(actor, params.projectId, body.customerGstin);
        return { status: 201, body: invoice };
      },
      cancelInvoice: async ({ params, body }) => {
        approve();
        return { status: 200, body: await this.invoices.cancel(actor, params.id, body.reason) };
      },
      listInvoices: async ({ query }) => {
        view();
        return { status: 200, body: await this.invoices.list(query) };
      },
      invoicePdf: async ({ params, query }) => {
        view();
        const file = await this.invoicePdf.render(params.id);
        return { status: 200, body: pdfBody(file, query.disposition) };
      },
      recordRefund: async ({ params, body }) => {
        approve();
        return { status: 201, body: await this.money.refund(actor, params.projectId, body) };
      },
      applyCredit: async ({ params, body }) => {
        record();
        return { status: 201, body: await this.money.applyCredit(actor, params.projectId, body) };
      },
      listCustomerMoney: async ({ query }) => {
        view();
        return { status: 200, body: await this.money.entries({ limit: query.limit }) };
      },
    });
  }

  private async projectBilling(projectId: string): Promise<ProjectBilling> {
    const source = await loadInvoiceSource(this.db, projectId);
    return {
      projectId,
      invoices: await this.invoices.forProject(projectId),
      draft: invoiceDraft(source),
      creditPaise: await this.money.credit(projectId),
      entries: await this.money.entries({ projectId, limit: 100 }),
    };
  }
}
