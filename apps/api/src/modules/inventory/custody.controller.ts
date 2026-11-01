import { Controller, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_UPLOAD_BYTES } from '@oneohm/domain';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import type { IncomingFile } from '../documents/upload-file';
import { CustodyService } from './custody.service';
import { CustodyPhotoService } from './custody-photo.service';
import { VIEW_INVENTORY } from './procurement.controller';

const routes = apiContract.inventory.custody;

/**
 * Material with contractors. The store issues and takes returns; the store, project
 * managers and approvers record usage; crews see and record only their own.
 */
@Controller()
export class CustodyController {
  constructor(
    private readonly custody: CustodyService,
    private readonly photos: CustodyPhotoService,
  ) {}

  @TsRestHandler(routes.project)
  project(@CurrentActor() actor: Actor) {
    return tsRestHandler(routes.project, async ({ params }) => {
      assertCan(actor, ...VIEW_INVENTORY, 'projects.view_all', 'contractors.manage');
      return { status: 200, body: await this.custody.project(params.id) };
    });
  }

  @TsRestHandler(routes.issue)
  issue(@CurrentActor() actor: Actor) {
    return tsRestHandler(routes.issue, async ({ params, body }) => {
      assertCan(actor, 'inventory.manage');
      return { status: 201, body: await this.custody.issue(actor, params.id, body) };
    });
  }

  @TsRestHandler(routes.recordUse)
  recordUse(@CurrentActor() actor: Actor) {
    return tsRestHandler(routes.recordUse, async ({ params, body }) => {
      assertCan(actor, 'inventory.manage', 'projects.manage', 'tasks.approve');
      return { status: 201, body: await this.custody.recordUse(actor, params.id, body) };
    });
  }

  @TsRestHandler(routes.recordReturn)
  recordReturn(@CurrentActor() actor: Actor) {
    return tsRestHandler(routes.recordReturn, async ({ params, body }) => {
      assertCan(actor, 'inventory.manage');
      return { status: 201, body: await this.custody.recordReturn(actor, params.id, body) };
    });
  }

  @TsRestHandler(routes.attachPhoto)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  attachPhoto(@CurrentActor() actor: Actor, @UploadedFile() file: IncomingFile | undefined) {
    return tsRestHandler(routes.attachPhoto, async ({ params }) => ({
      status: 201,
      body: await this.photos.attach(actor, params.id, file),
    }));
  }

  @TsRestHandler(routes.contractor)
  contractor(@CurrentActor() actor: Actor) {
    return tsRestHandler(routes.contractor, async ({ params }) => {
      assertCan(actor, 'contractors.manage', ...VIEW_INVENTORY);
      return { status: 200, body: await this.custody.contractor(params.id) };
    });
  }

  @TsRestHandler(routes.crewMaterial)
  crewMaterial(@CurrentActor() actor: Actor) {
    return tsRestHandler(routes.crewMaterial, async () => ({
      status: 200,
      body: await this.custody.crewMaterial(actor),
    }));
  }

  @TsRestHandler(routes.crewUse)
  crewUse(@CurrentActor() actor: Actor) {
    return tsRestHandler(routes.crewUse, async ({ body }) => ({
      status: 201,
      body: await this.custody.crewUse(actor, body),
    }));
  }
}
