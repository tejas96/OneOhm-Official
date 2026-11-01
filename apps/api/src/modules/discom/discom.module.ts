import { Module } from '@nestjs/common';
import { ChangeRequestStepsService } from './change-request-steps.service';
import { ChangeRequestsService } from './change-requests.service';
import { DiscomController } from './discom.controller';
import { DiscomDeskService } from './discom-desk.service';

/** The DISCOM desk and utility change requests (PRD 3.15, 3.16). */
@Module({
  controllers: [DiscomController],
  providers: [DiscomDeskService, ChangeRequestsService, ChangeRequestStepsService],
})
export class DiscomModule {}
