import { Controller, Req, StreamableFile } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Request } from 'express';
import { Public } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { QuotationPdfService } from '../reports/quotation-pdf.service';
import type { PdfFile } from '../reports/report-pdf.service';
import { CustomerAuthService, customerSession } from './customer-auth.service';
import { CustomerDocumentsService } from './customer-documents.service';
import { CustomerPortalService } from './customer-portal.service';

/** A rendered PDF as the response body (Nest streams StreamableFile with these headers). */
function pdf(file: PdfFile): Blob {
  const stream = new StreamableFile(file.content, {
    type: 'application/pdf',
    length: file.content.length,
    disposition: `inline; filename="${file.fileName}"`,
  });
  return stream as unknown as Blob;
}

/** Uploads have their own controller (multipart); everything else is handled here. */
const { addServiceRequestPhoto: _upload, ...routes } = apiContract.customer;

/**
 * The customer app's API. Staff sessions do not apply here (`@Public` for the staff
 * guard); every route but sign-in resolves the customer from the bearer token.
 */
@Public()
@Controller()
export class CustomerController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly portal: CustomerPortalService,
    private readonly quotationPdf: QuotationPdfService,
    private readonly papers: CustomerDocumentsService,
  ) {}

  @TsRestHandler(routes)
  handler(@Req() request: Request) {
    const session = () => customerSession(this.auth, request);
    return tsRestHandler(routes, {
      requestCode: async ({ body }) => ({
        status: 202,
        body: await this.auth.requestCode(body.phone),
      }),
      verifyCode: async ({ body }) => ({
        status: 200,
        body: await this.auth.verifyCode(body.phone, body.code),
      }),
      signOut: async () => {
        await this.auth.signOut((await session()).sessionId);
        return { status: 204, body: undefined };
      },
      home: async () => ({
        status: 200,
        body: await this.portal.home((await session()).customerId),
      }),
      quotationPdf: async ({ params }) => {
        const id = await this.portal.ownQuotation((await session()).customerId, params.id);
        return { status: 200, body: pdf(await this.quotationPdf.render(id)) };
      },
      listDocuments: async () => ({
        status: 200,
        body: await this.papers.list((await session()).customerId),
      }),
      documentFile: async ({ params }) => {
        const file = await this.papers.file((await session()).customerId, params.id);
        const stream = new StreamableFile(file.body, {
          type: file.type,
          ...(file.length === undefined ? {} : { length: file.length }),
          disposition: `inline; filename="${encodeURIComponent(file.name)}"`,
        });
        return { status: 200, body: stream as unknown as Blob };
      },
      listReports: async () => ({
        status: 200,
        body: await this.papers.readyReports((await session()).customerId),
      }),
      reportPdf: async ({ params }) => {
        const customer = (await session()).customerId;
        const file = await this.papers.reportPdf(customer, params.id, params.reportKey);
        return { status: 200, body: pdf(file) };
      },
      listReferrals: async () => ({
        status: 200,
        body: await this.portal.referrals((await session()).customerId),
      }),
      createReferral: async ({ body }) => ({
        status: 201,
        body: await this.portal.refer((await session()).customerId, body),
      }),
      listServiceRequests: async () => ({
        status: 200,
        body: await this.portal.serviceRequests((await session()).customerId),
      }),
      createServiceRequest: async ({ body }) => ({
        status: 201,
        body: await this.portal.raiseServiceRequest((await session()).customerId, body),
      }),
      giveFeedback: async ({ body }) => {
        await this.portal.feedback((await session()).customerId, body);
        return { status: 204, body: undefined };
      },
    });
  }
}
