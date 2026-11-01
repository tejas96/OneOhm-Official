import { Module } from '@nestjs/common';
import { ApprovalsInboxService } from './approvals-inbox.service';
import { BusinessSettingsController } from './business-settings.controller';
import { BusinessSettingsService } from './business-settings.service';
import { JobRunsService } from './job-runs.service';
import { ProjectVariantsService } from './project-variants.service';

/**
 * Central configuration owners change without a developer (PRD 7.2), the automatic
 * jobs' history (PRD 7.1) and each person's approvals list.
 */
@Module({
  controllers: [BusinessSettingsController],
  providers: [
    BusinessSettingsService,
    ProjectVariantsService,
    JobRunsService,
    ApprovalsInboxService,
  ],
})
export class BusinessSettingsModule {}
