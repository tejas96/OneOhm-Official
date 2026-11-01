import { Controller, Req, StreamableFile } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Request } from 'express';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { DocumentThumbnailsService } from './document-thumbnails.service';

const route = apiContract.documents.documentThumbnail;

/** Small photo previews for galleries and tiles (the original opens on view or download). */
@Controller()
export class DocumentThumbnailsController {
  constructor(private readonly thumbnails: DocumentThumbnailsService) {}

  @TsRestHandler(route)
  thumbnail(@CurrentActor() actor: Actor, @Req() request: Request) {
    return tsRestHandler(route, async ({ params }) => {
      const file = await this.thumbnails.thumbnail(actor, params.id);
      // A document's file never changes (a replacement is a new document), so the
      // browser may keep the preview; `private` keeps it out of shared caches.
      request.res?.setHeader('Cache-Control', 'private, max-age=604800, immutable');
      const stream = new StreamableFile(file.body, {
        type: file.type,
        disposition: 'inline',
        ...(file.length === undefined ? {} : { length: file.length }),
      });
      return { status: 200, body: stream as unknown as Blob };
    });
  }
}
