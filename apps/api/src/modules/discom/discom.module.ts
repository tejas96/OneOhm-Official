import { Module } from '@nestjs/common';
import { ChangeRequestNoticesService } from './change-request-notices';
import { ChangeRequestOptionsService } from './change-request-options.service';
import { ChangeRequestStepsService } from './change-request-steps.service';
import { ChangeRequestTypesController } from './change-request-types.controller';
import { ChangeRequestTypesService } from './change-request-types.service';
import { ChangeRequestsService } from './change-requests.service';
import { DiscomController } from './discom.controller';
import { DiscomDeskService } from './discom-desk.service';

/** The DISCOM desk and utility change requests (PRD 3.15, 3.16). */
@Module({
  controllers: [DiscomController, ChangeRequestTypesController],
  providers: [
    DiscomDeskService,
    ChangeRequestsService,
    ChangeRequestStepsService,
    ChangeRequestNoticesService,
    ChangeRequestTypesService,
    ChangeRequestOptionsService,
  ],
})
export class DiscomModule {}
