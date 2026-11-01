import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { CorrectionsService } from './corrections.service';
import { LeaveService } from './leave.service';
import { LocationRetentionService } from './location-retention.service';
import { PointsService } from './points.service';
import { RewardsController } from './rewards.controller';
import { WorkdayService } from './workday.service';
import { WorkforceController } from './workforce.controller';
import { WorkforceSettingsService } from './workforce-settings.service';

/** Attendance with consented location, leave with handover, points and their rules (PRD 3.12). */
@Module({
  controllers: [WorkforceController, RewardsController],
  providers: [
    WorkdayService,
    AttendanceService,
    CorrectionsService,
    LeaveService,
    PointsService,
    WorkforceSettingsService,
    LocationRetentionService,
  ],
})
export class WorkforceModule {}
