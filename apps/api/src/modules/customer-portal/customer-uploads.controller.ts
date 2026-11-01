import { Controller, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_UPLOAD_BYTES } from '@oneohm/domain';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Request } from 'express';
import { Public } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import type { IncomingFile } from '../documents/upload-file';
import { CustomerAuthService, customerSession } from './customer-auth.service';
import { CustomerRequestPhotosService } from './customer-request-photos.service';

/** Files from the customer app: one photo per request, held in memory. */
@Public()
@Controller()
export class CustomerUploadsController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly photos: CustomerRequestPhotosService,
  ) {}

  @TsRestHandler(apiContract.customer.addServiceRequestPhoto)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  addPhoto(@Req() request: Request, @UploadedFile() file: IncomingFile | undefined) {
    return tsRestHandler(apiContract.customer.addServiceRequestPhoto, async ({ params }) => {
      const { customerId } = await customerSession(this.auth, request);
      return { status: 201, body: await this.photos.add(customerId, params.id, file) };
    });
  }
}
