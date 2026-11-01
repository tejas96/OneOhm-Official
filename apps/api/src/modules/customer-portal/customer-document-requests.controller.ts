import { Controller, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_UPLOAD_BYTES } from '@oneohm/domain';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Request } from 'express';
import { Public } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import type { IncomingFile } from '../documents/upload-file';
import { CustomerAuthService, customerSession } from './customer-auth.service';
import { CustomerDocumentRequestsService } from './customer-document-requests.service';

const routes = apiContract.customerDocumentRequests;

/** Papers OneOhm asked for, and the photo or PDF that answers one (PRD 5.4). */
@Public()
@Controller()
export class CustomerDocumentRequestsController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly requests: CustomerDocumentRequestsService,
  ) {}

  @TsRestHandler(routes.listMyDocumentRequests)
  list(@Req() request: Request) {
    return tsRestHandler(routes.listMyDocumentRequests, async () => {
      const { customerId } = await customerSession(this.auth, request);
      return { status: 200, body: await this.requests.list(customerId) };
    });
  }

  @TsRestHandler(routes.answerDocumentRequest)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  answer(@Req() request: Request, @UploadedFile() file: IncomingFile | undefined) {
    return tsRestHandler(routes.answerDocumentRequest, async ({ params }) => {
      const { customerId } = await customerSession(this.auth, request);
      return { status: 201, body: await this.requests.answer(customerId, params.id, file) };
    });
  }
}
