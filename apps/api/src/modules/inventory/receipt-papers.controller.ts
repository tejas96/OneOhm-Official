import { Controller, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_UPLOAD_BYTES } from '@oneohm/domain';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import type { IncomingFile } from '../documents/upload-file';
import { VIEW_INVENTORY } from './procurement.controller';
import { ReceiptPapersService } from './receipt-papers.service';

const routes = apiContract.inventory.receiptPapers;

/** DCR papers on goods receipts: anyone who sees orders may read; the store attaches. */
@Controller()
export class ReceiptPapersController {
  constructor(private readonly papers: ReceiptPapersService) {}

  @TsRestHandler(routes.orderDcr)
  orderDcr(@CurrentActor() actor: Actor) {
    return tsRestHandler(routes.orderDcr, async ({ params }) => {
      assertCan(actor, ...VIEW_INVENTORY, 'projects.view_all');
      return { status: 200, body: await this.papers.orderDcr(params.id) };
    });
  }

  @TsRestHandler(routes.attachDcrCertificate)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  attachDcrCertificate(
    @CurrentActor() actor: Actor,
    @UploadedFile() file: IncomingFile | undefined,
  ) {
    return tsRestHandler(routes.attachDcrCertificate, async ({ params }) => {
      assertCan(actor, 'inventory.manage', 'procurement.manage');
      return { status: 201, body: await this.papers.attach(actor, params.id, file) };
    });
  }
}
