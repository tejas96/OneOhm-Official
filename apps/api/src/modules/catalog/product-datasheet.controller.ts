import { Controller, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_UPLOAD_BYTES } from '@oneohm/domain';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import type { IncomingFile } from '../documents/upload-file';
import { ProductDatasheetService } from './product-datasheet.service';

const routes = apiContract.productDatasheet;

/** Settings → Products: the maker's datasheet on a product. */
@Controller()
export class ProductDatasheetController {
  constructor(private readonly datasheets: ProductDatasheetService) {}

  @TsRestHandler(routes.uploadProductDatasheet)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(@CurrentActor() actor: Actor, @UploadedFile() file: IncomingFile | undefined) {
    return tsRestHandler(routes.uploadProductDatasheet, async ({ params }) => {
      assertCan(actor, 'settings.manage');
      return { status: 201, body: await this.datasheets.upload(actor, params.id, file) };
    });
  }
}
