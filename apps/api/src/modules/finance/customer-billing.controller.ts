import { Controller, Req, StreamableFile } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Request } from 'express';
import { Public } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { CustomerAuthService, customerSession } from '../customer-portal/customer-auth.service';
import type { PdfFile } from '../reports/report-pdf.service';
import { CustomerBillingService } from './customer-billing.service';

function pdf(file: PdfFile): Blob {
  const stream = new StreamableFile(file.content, {
    type: 'application/pdf',
    length: file.content.length,
    disposition: `inline; filename="${file.fileName}"`,
  });
  return stream as unknown as Blob;
}

/**
 * The customer app's invoices, receipts and refunds. Staff sessions do not apply
 * (`@Public` for the staff guard); every route resolves the customer from the bearer token.
 */
@Public()
@Controller()
export class CustomerBillingController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly billing: CustomerBillingService,
  ) {}

  @TsRestHandler(apiContract.customerBilling)
  handler(@Req() request: Request) {
    const customer = async () => (await customerSession(this.auth, request)).customerId;
    return tsRestHandler(apiContract.customerBilling, {
      billing: async () => ({ status: 200, body: await this.billing.billing(await customer()) }),
      invoicePdf: async ({ params }) => ({
        status: 200,
        body: pdf(await this.billing.invoice(await customer(), params.id)),
      }),
      receiptPdf: async ({ params }) => ({
        status: 200,
        body: pdf(await this.billing.receipt(await customer(), params.id)),
      }),
    });
  }
}
