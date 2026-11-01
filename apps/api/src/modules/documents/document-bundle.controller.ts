import { Controller, StreamableFile } from '@nestjs/common';
import { todayIn } from '@oneohm/shared';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { forbidden } from '../../common/http/errors';
import { apiContract } from '../../contract';
import { canDownloadMany, canPrintDocuments } from './document-access';
import { DocumentBundleService } from './document-bundle.service';

const routes = apiContract.documentBundle;

const fileName = (name: string | undefined) =>
  (name ?? `OneOhm documents ${todayIn()}`).replace(/[^\w .-]+/g, '-');

function asFile(content: Buffer, type: string, disposition: string): Blob {
  return new StreamableFile(content, {
    type,
    length: content.length,
    disposition,
  }) as unknown as Blob;
}

/** Downloads several documents as one ZIP, or one PDF to print. */
@Controller()
export class DocumentBundleController {
  constructor(private readonly bundles: DocumentBundleService) {}

  @TsRestHandler(routes)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(routes, {
      zip: async ({ body }) => {
        assertCan(actor, 'documents.view');
        if (!canDownloadMany(actor)) throw forbidden('You may not download documents.');
        const files = await this.bundles.load(actor, body.ids);
        const name = fileName(body.name);
        return {
          status: 200,
          body: asFile(
            this.bundles.zip(files),
            'application/zip',
            `attachment; filename="${name}.zip"`,
          ),
        };
      },
      pdf: async ({ body }) => {
        assertCan(actor, 'documents.view');
        if (!canPrintDocuments(actor) && !canDownloadMany(actor)) {
          throw forbidden('You may not print or download documents.');
        }
        const files = await this.bundles.load(actor, body.ids);
        const name = fileName(body.name);
        return {
          status: 200,
          body: asFile(
            await this.bundles.pdf(files),
            'application/pdf',
            `inline; filename="${name}.pdf"`,
          ),
        };
      },
    });
  }
}
