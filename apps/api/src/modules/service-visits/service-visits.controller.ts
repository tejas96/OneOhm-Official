import { Controller, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { uploadLimitFor } from '@oneohm/domain';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { type Actor, assertCan } from '../../common/auth/actor';
import { CurrentActor } from '../../common/auth/auth.decorators';
import { apiContract } from '../../contract';
import type { IncomingFile } from '../documents/upload-file';
import { SERVICE_FILE_TYPES, ServiceFilesService } from './service-files.service';
import { ServiceFinishService } from './service-finish.service';
import { ServiceVisitsService } from './service-visits.service';

const routes = apiContract.serviceVisits;
const { uploadServiceFile, ...json } = routes;

/** Service visits in the field app and their record on the service desk (PRD 5.5). */
@Controller()
export class ServiceVisitsController {
  constructor(
    private readonly visits: ServiceVisitsService,
    private readonly finishing: ServiceFinishService,
    private readonly files: ServiceFilesService,
  ) {}

  @TsRestHandler(json)
  handler(@CurrentActor() actor: Actor) {
    // Anyone a request can be given to: the service team, or staff working assigned tasks.
    const fieldWorker = () => assertCan(actor, 'service.manage', 'tasks.view_assigned');
    return tsRestHandler(json, {
      myServiceVisits: async () => {
        fieldWorker();
        return { status: 200, body: await this.visits.mine(actor) };
      },
      serviceVisit: async ({ params }) => {
        fieldWorker();
        return { status: 200, body: await this.visits.detail(actor, params.id) };
      },
      serviceCheckIn: async ({ params, body }) => {
        fieldWorker();
        return { status: 200, body: await this.visits.checkIn(actor, params.id, body.position) };
      },
      serviceCheckOut: async ({ params, body }) => {
        fieldWorker();
        return { status: 200, body: await this.visits.checkOut(actor, params.id, body.position) };
      },
      finishServiceVisit: async ({ params, body }) => {
        fieldWorker();
        return { status: 200, body: await this.finishing.finish(actor, params.id, body) };
      },
      serviceFieldWork: async ({ params }) => {
        assertCan(actor, 'service.manage', 'customers.view');
        return { status: 200, body: await this.visits.fieldWork(params.id) };
      },
    });
  }

  @TsRestHandler(uploadServiceFile)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: uploadLimitFor(SERVICE_FILE_TYPES), files: 1 } }),
  )
  upload(@CurrentActor() actor: Actor, @UploadedFile() file: IncomingFile | undefined) {
    return tsRestHandler(uploadServiceFile, async ({ params, body }) => {
      assertCan(actor, 'service.manage', 'tasks.view_assigned');
      return {
        status: 201,
        body: await this.files.add(actor, params.id, file, body as unknown),
      };
    });
  }
}
