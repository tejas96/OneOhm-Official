import { Controller, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_UPLOAD_BYTES, safeFileName } from '@oneohm/domain';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Actor } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { CompanyAssetsService } from './company-assets.service';
import { DocumentsService } from './documents.service';
import type { IncomingFile } from './upload-file';

const routes = apiContract.documents;
/** One file per request, held in memory; the size cap answers 413 before it is read fully. */
const singleFile = () =>
  UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }));

function contentDisposition(kind: 'inline' | 'attachment', name: string): string {
  return `${kind}; filename="${safeFileName(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

@Controller()
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly assets: CompanyAssetsService,
  ) {}

  @TsRestHandler({
    listDocuments: routes.listDocuments,
    documentFile: routes.documentFile,
    removeDocument: routes.removeDocument,
    companyAssets: routes.companyAssets,
  })
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(
      {
        listDocuments: routes.listDocuments,
        documentFile: routes.documentFile,
        removeDocument: routes.removeDocument,
        companyAssets: routes.companyAssets,
      },
      {
        listDocuments: async ({ query }) => ({
          status: 200,
          body: await this.documents.list(actor, query),
        }),
        documentFile: async ({ params, query }) => {
          const file = await this.documents.file(actor, params.id, query.disposition);
          const stream = new StreamableFile(file.body, {
            type: file.type,
            ...(file.length === undefined ? {} : { length: file.length }),
            disposition: contentDisposition(query.disposition, file.name),
          });
          return { status: 200, body: stream as unknown as Blob };
        },
        removeDocument: async ({ params }) => {
          await this.documents.remove(actor, params.id);
          return { status: 204, body: undefined };
        },
        companyAssets: async () => ({ status: 200, body: await this.assets.current() }),
      },
    );
  }

  @TsRestHandler(routes.uploadDocument)
  @singleFile()
  upload(@CurrentActor() actor: Actor, @UploadedFile() file: IncomingFile | undefined) {
    return tsRestHandler(routes.uploadDocument, async ({ body }) => ({
      status: 201,
      body: await this.documents.upload(actor, file, body as unknown),
    }));
  }

  @TsRestHandler(routes.replaceDocument)
  @singleFile()
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
