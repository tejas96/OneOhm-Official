import { Controller, Req, StreamableFile } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Request } from 'express';
import { Public } from '../../common/auth/auth.decorators';
import { bearerToken } from '../../common/auth/session-cookies';
import { unauthenticated } from '../../common/http/errors';
import { apiContract } from '../../contract';
import { QuotationPdfService } from '../reports/quotation-pdf.service';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerPortalService } from './customer-portal.service';

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
  ) {}

  @TsRestHandler(apiContract.customer)
  handler(@Req() request: Request) {
    const session = async () => {
      const token = bearerToken(request);
      const found = token ? await this.auth.authenticate(token) : null;
      if (!found) throw unauthenticated();
      return found;
    };
    return tsRestHandler(apiContract.customer, {
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
        const file = await this.quotationPdf.render(id);
        const stream = new StreamableFile(file.content, {
          type: 'application/pdf',
          length: file.content.length,
          disposition: `inline; filename="${file.fileName}"`,
        });
        return { status: 200, body: stream as unknown as Blob };
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
