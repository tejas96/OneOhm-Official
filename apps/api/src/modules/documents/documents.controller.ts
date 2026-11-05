import { Controller, Req, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  EVIDENCE_FILE_TYPES,
  MAX_UPLOAD_BYTES,
  safeFileName,
  uploadLimitFor,
} from '@oneohm/domain';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Request } from 'express';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { CompanyAssetsService } from './company-assets.service';
import { canViewAllDocuments } from './document-access';
import { DocumentCheckService } from './document-check.service';
import { DocumentMoveService } from './document-move.service';
import { DocumentsService } from './documents.service';
import { fileSystemPapers } from './system-papers-hook';
import type { IncomingFile } from './upload-file';

const routes = apiContract.documents;
/** One file per request, held in memory; the size cap answers 413 before it is read fully. */
const singleFile = (fileSize = MAX_UPLOAD_BYTES) =>
  UseInterceptors(FileInterceptor('file', { limits: { fileSize, files: 1 } }));
/** Task evidence may be a video (60 MB); each type's own cap is checked after reading. */
const evidenceFile = () => singleFile(uploadLimitFor(EVIDENCE_FILE_TYPES));

/** One plain byte range ("bytes=0-1023", "bytes=500-", "bytes=-500"); anything else is ignored. */
export function byteRange(header: string | undefined): string | undefined {
  return header && /^bytes=(\d+-\d*|-\d+)$/.test(header.trim()) ? header.trim() : undefined;
}

function contentDisposition(kind: 'inline' | 'attachment', name: string): string {
  return `${kind}; filename="${safeFileName(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

@Controller()
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly assets: CompanyAssetsService,
    private readonly moves: DocumentMoveService,
    private readonly checks: DocumentCheckService,
  ) {}

  @TsRestHandler({
    listDocuments: routes.listDocuments,
    documentFile: routes.documentFile,
    moveDocument: routes.moveDocument,
    checkDocument: routes.checkDocument,
    documentHomes: routes.documentHomes,
    removeDocument: routes.removeDocument,
    companyAssets: routes.companyAssets,
  })
  handler(@CurrentActor() actor: Actor, @Req() request: Request) {
    return tsRestHandler(
      {
        listDocuments: routes.listDocuments,
        documentFile: routes.documentFile,
        moveDocument: routes.moveDocument,
        checkDocument: routes.checkDocument,
        documentHomes: routes.documentHomes,
        removeDocument: routes.removeDocument,
        companyAssets: routes.companyAssets,
      },
      {
        listDocuments: async ({ query }) => {
          // New receipts, invoices and work orders are on file before the list is read.
          if (canViewAllDocuments(actor)) await fileSystemPapers(query);
          return { status: 200, body: await this.documents.list(actor, query) };
        },
        documentFile: async ({ params, query }) => {
          const range = byteRange(request.headers.range);
          const file = await this.documents.file(actor, params.id, query.disposition, range);
          const stream = new StreamableFile(file.body, {
            type: file.type,
            ...(file.length === undefined ? {} : { length: file.length }),
            disposition: contentDisposition(query.disposition, file.name),
          });
          // Browsers seek in a video or voice note by asking for one part at a time.
          // (`@Res` would switch Nest to manual responses, so the headers go on `req.res`.)
          request.res?.setHeader('Accept-Ranges', 'bytes');
          if (file.contentRange) {
            request.res?.setHeader('Content-Range', file.contentRange);
            return { status: 206, body: stream as unknown as Blob };
          }
          return { status: 200, body: stream as unknown as Blob };
        },
        moveDocument: async ({ params, body }) => ({
          status: 200,
          body: await this.moves.move(actor, params.id, body),
        }),
        checkDocument: async ({ params }) => ({
          status: 200,
          body: await this.checks.check(actor, params.id),
        }),
        documentHomes: async ({ params }) => ({
          status: 200,
          body: await this.moves.homes(actor, params.id),
        }),
        removeDocument: async ({ params }) => {
          await this.documents.remove(actor, params.id);
          return { status: 204, body: undefined };
        },
        companyAssets: async () => ({ status: 200, body: await this.assets.current() }),
      },
    );
  }

  @TsRestHandler(routes.uploadDocument)
  @evidenceFile()
  upload(@CurrentActor() actor: Actor, @UploadedFile() file: IncomingFile | undefined) {
    return tsRestHandler(routes.uploadDocument, async ({ body }) => ({
      status: 201,
      body: await this.documents.upload(actor, file, body as unknown),
    }));
  }

  @TsRestHandler(routes.replaceDocument)
  @evidenceFile()
  replace(@CurrentActor() actor: Actor, @UploadedFile() file: IncomingFile | undefined) {
    return tsRestHandler(routes.replaceDocument, async ({ params }) => ({
      status: 201,
      body: await this.documents.replace(actor, params.id, file),
    }));
  }

  @TsRestHandler(routes.uploadCompanyAsset)
  @singleFile()
  uploadAsset(@CurrentActor() actor: Actor, @UploadedFile() file: IncomingFile | undefined) {
    return tsRestHandler(routes.uploadCompanyAsset, async ({ params }) => ({
      status: 201,
      body: await this.assets.upload(actor, params.kind, file),
    }));
  }
}
