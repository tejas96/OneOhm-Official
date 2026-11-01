import { Controller } from '@nestjs/common';
import { todayIn } from '@oneohm/shared';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import { CatalogService } from '../catalog/catalog.service';
import { checklistHtml } from './checklist-pdf';
import { DocumentChecklistService } from './document-checklist.service';
import { PdfRendererService } from './pdf-renderer.service';
import { pdfBody } from './reports.controller';

@Controller()
export class DocumentChecklistController {
  constructor(
    private readonly checklists: DocumentChecklistService,
    private readonly renderer: PdfRendererService,
    private readonly catalog: CatalogService,
  ) {}

  @TsRestHandler(apiContract.documentChecklist)
  handler(@CurrentActor() actor: Actor) {
    return tsRestHandler(apiContract.documentChecklist, {
      checklist: async ({ params }) => {
        assertCan(actor, 'documents.view');
        const {
          code: _code,
          customer: _customer,
          ...body
        } = await this.checklists.checklist(params.id);
        return { status: 200, body };
      },
      checklistPdf: async ({ params }) => {
        assertCan(actor, 'documents.view');
        const list = await this.checklists.checklist(params.id);
        const company = await this.catalog.company();
        const html = checklistHtml({
          company: company.brandName,
          code: list.code,
          customer: list.customer,
          date: todayIn(),
          items: list.items,
        });
        const content = await this.renderer.render(html, {
          footer: `${list.code} · Document checklist`,
        });
        return {
          status: 200,
          body: pdfBody({ fileName: `${list.code}-checklist.pdf`, content }, 'inline'),
        };
      },
    });
  }
}
